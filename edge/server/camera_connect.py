"""
Check if RTSP camera is reachable (connection only, no frame decode).
Uses socket connect to host:port so cameras show disconnected when actually unreachable.
"""
import logging
import socket
from urllib.parse import urlparse

logger = logging.getLogger("edge.camera_connect")

DEFAULT_RTSP_PORT = 554
CONNECT_TIMEOUT = 4


def check_rtsp_reachable(rtsp_url: str) -> tuple[bool, str | None]:
    """
    Return (connected, error_message).
    Tries to connect to the RTSP host:port. Does not require opencv/ffmpeg.
    """
    if not rtsp_url or not isinstance(rtsp_url, str):
        return False, "لا يوجد رابط"
    url = rtsp_url.strip()
    if not url.startswith(("rtsp://", "rtsps://")):
        return False, "رابط غير مدعوم"
    try:
        parsed = urlparse(url)
        host = parsed.hostname or parsed.netloc.split(":")[0]
        port = parsed.port
        if port is None:
            port = DEFAULT_RTSP_PORT
        if not host:
            return False, "استضافة غير صالحة"
        sock = socket.create_connection((host, port), timeout=CONNECT_TIMEOUT)
        sock.close()
        return True, None
    except socket.timeout:
        return False, "انتهت المهلة"
    except socket.gaierror as e:
        return False, "لا يمكن حل العنوان"
    except OSError as e:
        return False, str(e)[:80] if e else "فشل الاتصال"
    except Exception as e:
        logger.debug("RTSP check %s: %s", url[:50], e)
        return False, str(e)[:80] if e else "خطأ اتصال"
