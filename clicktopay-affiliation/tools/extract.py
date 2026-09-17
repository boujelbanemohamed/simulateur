import sys
class Blocker:
    def find_module(self, name, path=None):
        if name == "cryptography" or name.startswith("cryptography."):
            return self
        return None
    def load_module(self, name):
        raise ImportError("blocked")
    def find_spec(self, name, path=None, target=None):
        if name == "cryptography" or name.startswith("cryptography."):
            raise ImportError("blocked")
        return None
sys.meta_path.insert(0, Blocker())
from pypdf import PdfReader
r = PdfReader("visa-mds.pdf")
print("pages:", len(r.pages), file=sys.stderr)
with open("visa-mds.txt", "w") as f:
    for i, p in enumerate(r.pages):
        f.write(f"\n===PAGE {i+1}===\n")
        try:
            f.write(p.extract_text() or "")
        except Exception as e:
            f.write(f"[err {e}]")
