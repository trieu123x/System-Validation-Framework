package phanphoi.common.web;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Định tuyến API đơn giản: "GET /api/products/{id}" → handler nhận tham số đường dẫn. */
public final class Router implements HttpHandler {

    @FunctionalInterface
    public interface Route {
        void handle(HttpExchange ex, List<String> pathParams) throws Exception;
    }

    private record Entry(String method, Pattern pattern, Route route) {
    }

    private final List<Entry> entries = new ArrayList<>();

    public Router get(String path, Route r) {
        return add("GET", path, r);
    }

    public Router post(String path, Route r) {
        return add("POST", path, r);
    }

    public Router put(String path, Route r) {
        return add("PUT", path, r);
    }

    public Router delete(String path, Route r) {
        return add("DELETE", path, r);
    }

    private Router add(String method, String path, Route r) {
        String regex = "^" + path.replaceAll("\\{[^/]+}", "([^/]+)") + "/?$";
        entries.add(new Entry(method, Pattern.compile(regex), r));
        return this;
    }

    @Override
    public void handle(HttpExchange ex) throws IOException {
        String path = ex.getRequestURI().getPath();
        boolean pathMatched = false;
        for (Entry e : entries) {
            Matcher m = e.pattern.matcher(path);
            if (!m.matches()) {
                continue;
            }
            pathMatched = true;
            if (!e.method.equals(ex.getRequestMethod())) {
                continue;
            }
            List<String> params = new ArrayList<>();
            for (int i = 1; i <= m.groupCount(); i++) {
                params.add(java.net.URLDecoder.decode(m.group(i), java.nio.charset.StandardCharsets.UTF_8));
            }
            try {
                e.route.handle(ex, params);
            } catch (Http.ApiException err) {
                Http.error(ex, err.status(), err.getMessage());
            } catch (DateTimeParseException err) {
                Http.error(ex, 400, "Ngay phai co dang yyyy-MM-dd");
            } catch (NumberFormatException err) {
                Http.error(ex, 400, "Gia tri so khong hop le");
            } catch (Exception err) {
                err.printStackTrace();
                Http.error(ex, 500, err.getMessage());
            }
            return;
        }
        Http.error(ex, pathMatched ? 405 : 404, pathMatched ? "Sai phuong thuc" : "Khong tim thay API");
    }
}
