import os, subprocess, json, struct
from io import BytesIO
from flask import Flask, request, make_response
from concurrent.futures import ThreadPoolExecutor
from threading import Lock

app = Flask(__name__)
lock = Lock()

resolution = "256:144"
mime = "image/avif"
ext = ".avif"

encode = [
  "avifenc", "INPUT", "-o", "OUTPUT", "-s", "6", "--min", "27", "--max", "32",
  "-a", "sharpness=7", "-r", "l", "-d", "8", "-p", "-y", "444"
]

working_dir = "frames"
encode_dir = "avif"

port = 8980


def get_stream(url):
  probe = [
    "ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", url
  ]

  p = subprocess.run(probe, capture_output=True, universal_newlines=True)
  j = json.loads(p.stdout)

  for stream in j["streams"]:
    if stream["codec_type"] == "video":
      return stream
  return None


def run_cmd(e):
  cmd, _msg = e
  subprocess.run(cmd, capture_output=True)


@app.route("/", methods=["GET"])
def root():
  return "online", 200


@app.route("/generate", methods=["GET"])
def generate():
  with lock:
    url = request.args.get("url")
    if not url: return "404", 404
    print(url)

    stream = get_stream(url)
    if not stream: return "404", 404

    duration = float(stream["duration"])
    n_frames = int(stream["nb_frames"])
    framerate = n_frames / duration

    frame_d = int(n_frames / 100)
    frame_d = max(frame_d, round(2 * framerate))
    num_frames = int(n_frames / frame_d)
    frames = [i * frame_d for i in range(num_frames) if i * frame_d < n_frames]

    os.makedirs(working_dir, exist_ok=True)
    os.makedirs(encode_dir, exist_ok=True)

    frames_s = "+".join([f"eq(n\,{i})" for i in frames])
    select = f"select={frames_s}"
    ffmpeg = [
      "ffmpeg", "-loglevel", "error", "-i", url, "-vf",
      f"scale={resolution},{select}", "-vsync", "0", "-vframes",
      str(len(frames)),
      os.path.join(working_dir, "%03d.png"), "-y"
    ]
    subprocess.run(ffmpeg)

    files = [f"{i + 1:03d}" for i in range(len(frames))]

    with ThreadPoolExecutor(max_workers=4) as pool:
      for file in files:
        old_file = os.path.join(working_dir, f"{file}.png")
        new_file = os.path.join(encode_dir, f"{file}{ext}")

        cmd = [old_file if arg == "INPUT" else arg for arg in encode]
        cmd = [new_file if arg == "OUTPUT" else arg for arg in cmd]

        pool.submit(run_cmd, (cmd, f"{old_file} -> {new_file}"))

    last_frame = round(frames[-1] / framerate, 2)

    binary_bytes = BytesIO()
    binary_bytes.write(struct.pack("If", len(frames), last_frame))
    binary_bytes.write(mime.encode("ascii"))
    binary_bytes.seek(40)
    for file in files:
      path = os.path.join(encode_dir, f"{file}{ext}")
      file_bytes = open(path, "rb").read()
      binary_bytes.write(struct.pack("I", len(file_bytes)))
      binary_bytes.write(file_bytes)

    binary_bytes.seek(0)
    response = make_response(binary_bytes.read())
    response.headers.set("Content-Type", "application/octet-stream")

    return response, 200


if __name__ == "__main__":
  from wsgiserver import WSGIServer
  WSGIServer(app, port=port).start()
