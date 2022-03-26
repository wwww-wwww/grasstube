from io import BytesIO
import os, sys, requests, urllib.parse

target = "http://host/generate"
file_host = "https://host/"
thumb_root = "/mnt/1/"
thumbs = "thumbs"


def run(path, root):
  filename = os.path.basename(path)
  file = urllib.parse.quote(filename)

  r = requests.get(target, params={"url": f"{file_host}/{root}/{file}"})
  b = BytesIO(r.content)

  filename = os.path.splitext(filename)[0]
  os.makedirs(os.path.join(thumb_root, root, thumbs), exist_ok=True)
  path = os.path.join(thumb_root, root, thumbs, f"{filename}.thumb")
  with open(path, "wb+") as f:
    f.write(b.getbuffer())


# Usage: thumbnail_client.py filename root
# filename should be accessible on the internet at
# file_host/root/filename
# thumbs are stored in thumb_root/root/thumbs
if __name__ == "__main__":
  run(sys.argv[1], sys.argv[2])
