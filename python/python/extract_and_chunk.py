import sys
import json
import pdfplumber
import docx2txt

def extract_text(file_path, mime_type):
    if mime_type == "application/pdf":
        text = ""
        with pdfplumber.open(file_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
        return text

    if mime_type in [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword"
    ]:
        return docx2txt.process(file_path)

    if mime_type.startswith("text/"):
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()

    raise Exception("Unsupported file type: " + mime_type)


def chunk_text(text, chunk_size=1000, overlap=100):
    chunks = []
    start = 0
    index = 0

    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end].strip()

        chunks.append({
            "index": index,
            "content": chunk
        })

        start = end - overlap
        index += 1

    return chunks


if __name__ == "__main__":
    file_path = sys.argv[1]
    mime_type = sys.argv[2]

    raw_text = extract_text(file_path, mime_type)
    chunks = chunk_text(raw_text)

    print(json.dumps({
        "text": raw_text,
        "chunks": chunks
    }))
