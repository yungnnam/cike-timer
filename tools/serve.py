"""静态服务器：不发缓存头，改完文件刷新就能看到（python -m http.server 会启发式缓存）。

用法：python serve_nocache.py <port> <dir>
"""
import functools
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# Windows 的注册表里常常没有这几个类型，补上；apk 尤其重要，
# 用 application/vnd.android.package-archive 手机才会识别成「安装包」而不是「未知文件」。
SimpleHTTPRequestHandler.extensions_map.update({
    ".apk": "application/vnd.android.package-archive",
    ".webmanifest": "application/manifest+json",
    ".js": "application/javascript",
    ".json": "application/json",
})


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # 安静一点，别把后台任务日志塞满


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8788
    directory = sys.argv[2] if len(sys.argv) > 2 else "."
    handler = functools.partial(NoCacheHandler, directory=directory)
    with ThreadingHTTPServer(("0.0.0.0", port), handler) as httpd:
        print(f"serving {directory} on 0.0.0.0:{port} (no-store)", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
