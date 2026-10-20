package phanphoi.server;

import phanphoi.common.ErrorCode;
import phanphoi.common.web.Http;

/** Lỗi nghiệp vụ; ClientHandler đổi thành ERROR|maLoi|moTa, API admin đổi thành HTTP 4xx. */
public class ServiceException extends Http.ApiException {

    private final ErrorCode code;

    public ServiceException(ErrorCode code, String message) {
        super(httpStatus(code), message);
        this.code = code;
    }

    public ErrorCode code() {
        return code;
    }

    private static int httpStatus(ErrorCode code) {
        return switch (code) {
            case E04 -> 404;
            case E03 -> 409;
            default -> 400;
        };
    }
}
