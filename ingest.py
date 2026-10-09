import os
import sys
import time
import argparse
from pathlib import Path

from dotenv import load_dotenv
from pypdf import PdfReader
from google import genai
from google.genai import types
from supabase import create_client, Client


# ============================================================
# CONFIG
# ============================================================

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

EMBEDDING_MODEL = "gemini-embedding-2"
EMBEDDING_DIMENSION = 1536

TABLE_NAME = "ncert_documents"

# Chunk configuration
CHUNK_SIZE = 1800
CHUNK_OVERLAP = 250

# How many rows to insert at once
INSERT_BATCH_SIZE = 20

# Retry configuration
MAX_RETRIES = 4
RETRY_DELAY = 3


# ============================================================
# ENVIRONMENT CHECK
# ============================================================

if not GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY is missing from .env"
    )

if not SUPABASE_URL:
    raise RuntimeError(
        "SUPABASE_URL is missing from .env"
    )

if not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError(
        "SUPABASE_SERVICE_ROLE_KEY is missing from .env"
    )


# ============================================================
# CLIENTS
# ============================================================

gemini = genai.Client(
    api_key=GEMINI_API_KEY
)

supabase: Client = create_client(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
)


# ============================================================
# PDF TEXT EXTRACTION
# ============================================================

def extract_pdf_pages(pdf_path: str):
    """
    Extract text page-by-page from an NCERT PDF.

    Returns:
        [
            {
                "page": 1,
                "text": "..."
            },
            ...
        ]
    """

    print(f"\n📖 Reading PDF: {pdf_path}")

    reader = PdfReader(pdf_path)

    pages = []

    for page_number, page in enumerate(reader.pages, start=1):

        try:
            text = page.extract_text() or ""
        except Exception as e:
            print(
                f"⚠️ Could not extract page {page_number}: {e}"
            )
            text = ""

        text = clean_text(text)

        if text:
            pages.append(
                {
                    "page": page_number,
                    "text": text
                }
            )

    print(
        f"✅ Extracted text from "
        f"{len(pages)}/{len(reader.pages)} pages"
    )

    return pages


# ============================================================
# TEXT CLEANING
# ============================================================

def clean_text(text: str) -> str:
    """
    Clean unnecessary whitespace while keeping
    the actual educational content.
    """

    text = text.replace("\x00", " ")

    # Normalize line endings
    text = text.replace("\r\n", "\n")
    text = text.replace("\r", "\n")

    # Remove excessive spaces
    lines = []

    for line in text.split("\n"):
        line = " ".join(line.split())

        if line:
            lines.append(line)

    return "\n".join(lines).strip()


# ============================================================
# CHUNKING
# ============================================================

def create_chunks(
    pages,
    chunk_size=CHUNK_SIZE,
    overlap=CHUNK_OVERLAP
):
    """
    Convert page text into overlapping chunks.

    Each chunk keeps its source page.
    """

    chunks = []

    for page_data in pages:

        page_number = page_data["page"]
        text = page_data["text"]

        if not text:
            continue

        start = 0
        text_length = len(text)

        while start < text_length:

            end = min(
                start + chunk_size,
                text_length
            )

            chunk_text = text[start:end].strip()

            if chunk_text:
                chunks.append(
                    {
                        "content": chunk_text,
                        "source_page": page_number
                    }
                )

            if end >= text_length:
                break

            next_start = end - overlap

            if next_start <= start:
                next_start = end

            start = next_start

    print(f"🧩 Created {len(chunks)} chunks")

    return chunks


# ============================================================
# GEMINI EMBEDDING
# ============================================================

def generate_embedding(text: str):
    """
    Generate a 1536-dimensional Gemini embedding.
    """

    for attempt in range(1, MAX_RETRIES + 1):

        try:

            response = gemini.models.embed_content(
                model=EMBEDDING_MODEL,
                contents=text,
                config=types.EmbedContentConfig(
                    output_dimensionality=EMBEDDING_DIMENSION
                )
            )

            if not response.embeddings:
                raise RuntimeError(
                    "Gemini returned no embedding."
                )

            embedding = response.embeddings[0].values

            if len(embedding) != EMBEDDING_DIMENSION:
                raise RuntimeError(
                    f"Expected {EMBEDDING_DIMENSION} dimensions, "
                    f"got {len(embedding)}"
                )

            return embedding

        except Exception as e:

            print(
                f"⚠️ Embedding attempt "
                f"{attempt}/{MAX_RETRIES} failed: {e}"
            )

            if attempt == MAX_RETRIES:
                raise

            time.sleep(
                RETRY_DELAY * attempt
            )


# ============================================================
# OPTIONAL: REMOVE OLD DOCUMENTS
# ============================================================

def delete_existing_documents(
    class_level,
    subject,
    source_name
):
    """
    Delete previously ingested chunks for the same
    class + subject + source.

    Used when --replace is supplied.
    """

    print("\n🗑️ Removing existing documents...")

    response = (
        supabase
        .table(TABLE_NAME)
        .delete()
        .eq("class_level", class_level)
        .eq("subject", subject)
        .eq("source_name", source_name)
        .execute()
    )

    print("✅ Old documents removed")


# ============================================================
# SUPABASE INSERT
# ============================================================

def insert_documents(documents):
    """
    Insert documents into Supabase in batches.
    """

    total = len(documents)

    for start in range(
        0,
        total,
        INSERT_BATCH_SIZE
    ):

        batch = documents[
            start:start + INSERT_BATCH_SIZE
        ]

        try:

            (
                supabase
                .table(TABLE_NAME)
                .insert(batch)
                .execute()
            )

            end = min(
                start + len(batch),
                total
            )

            print(
                f"📤 Inserted "
                f"{end}/{total}"
            )

        except Exception as e:

            print(
                f"\n❌ Supabase insert failed "
                f"for batch starting at {start}"
            )

            raise e


# ============================================================
# MAIN INGESTION
# ============================================================

def ingest_pdf(
    pdf_path,
    class_level,
    subject,
    chapter,
    topic=None,
    replace=False
):

    pdf_file = Path(pdf_path)

    if not pdf_file.exists():
        raise FileNotFoundError(
            f"PDF not found: {pdf_file}"
        )

    source_name = pdf_file.name

    print("\n========================================")
    print("       STUDY NOTES PRO RAG INGEST")
    print("========================================")

    print(f"PDF       : {source_name}")
    print(f"Class     : {class_level}")
    print(f"Subject   : {subject}")
    print(f"Chapter   : {chapter}")
    print(f"Topic     : {topic or 'General'}")
    print(f"Embedding : {EMBEDDING_MODEL}")
    print(f"Dimension : {EMBEDDING_DIMENSION}")

    # --------------------------------------------------------
    # 1. Extract PDF
    # --------------------------------------------------------

    pages = extract_pdf_pages(
        str(pdf_file)
    )

    if not pages:
        raise RuntimeError(
            "No readable text was extracted from the PDF."
        )

    # --------------------------------------------------------
    # 2. Create chunks
    # --------------------------------------------------------

    chunks = create_chunks(pages)

    if not chunks:
        raise RuntimeError(
            "No chunks were created."
        )

    # --------------------------------------------------------
    # 3. Optional replacement
    # --------------------------------------------------------

    if replace:
        delete_existing_documents(
            class_level=class_level,
            subject=subject,
            source_name=source_name
        )

    # --------------------------------------------------------
    # 4. Generate embeddings
    # --------------------------------------------------------

    documents = []

    total_chunks = len(chunks)

    print(
        f"\n🧠 Generating embeddings for "
        f"{total_chunks} chunks..."
    )

    for index, chunk in enumerate(
        chunks,
        start=1
    ):

        print(
            f"   Embedding chunk "
            f"{index}/{total_chunks}..."
        )

        embedding = generate_embedding(
            chunk["content"]
        )

        document = {
            "class_level": str(class_level),

            "subject": subject,

            "chapter": chapter,

            "topic": topic,

            "content": chunk["content"],

            "source_name": source_name,

            "source_page": chunk["source_page"],

            "chunk_index": index,

            "metadata": {
                "book": source_name,
                "embedding_model": EMBEDDING_MODEL,
                "embedding_dimension": EMBEDDING_DIMENSION,
                "chunk_size": CHUNK_SIZE,
                "chunk_overlap": CHUNK_OVERLAP
            },

            "embedding": embedding
        }

        documents.append(document)

    # --------------------------------------------------------
    # 5. Insert into Supabase
    # --------------------------------------------------------

    print("\n💾 Uploading chunks to Supabase...")

    insert_documents(documents)

    print("\n========================================")
    print("             INGEST COMPLETE")
    print("========================================")

    print(
        f"✅ {len(documents)} chunks inserted"
    )

    print(
        f"✅ Class: {class_level}"
    )

    print(
        f"✅ Subject: {subject}"
    )

    print(
        f"✅ Chapter: {chapter}"
    )

    print(
        f"✅ Embedding: {EMBEDDING_DIMENSION} dimensions"
    )


# ============================================================
# COMMAND LINE
# ============================================================

def main():

    parser = argparse.ArgumentParser(
        description=(
            "Ingest an NCERT PDF into "
            "Study Notes Pro RAG."
        )
    )

    parser.add_argument(
        "pdf",
        help="Path to the NCERT PDF"
    )

    parser.add_argument(
        "--class-level",
        required=True,
        help="CBSE class, e.g. 12"
    )

    parser.add_argument(
        "--subject",
        required=True,
        help="Subject, e.g. Physics"
    )

    parser.add_argument(
        "--chapter",
        required=True,
        help="Chapter name"
    )

    parser.add_argument(
        "--topic",
        default=None,
        help="Optional topic name"
    )

    parser.add_argument(
        "--replace",
        action="store_true",
        help=(
            "Delete existing chunks for the same "
            "class, subject and PDF before inserting."
        )
    )

    args = parser.parse_args()

    ingest_pdf(
        pdf_path=args.pdf,
        class_level=args.class_level,
        subject=args.subject,
        chapter=args.chapter,
        topic=args.topic,
        replace=args.replace
    )


if __name__ == "__main__":
    main()