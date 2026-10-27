package phanphoi.common.web;

import com.sun.net.httpserver.HttpExchange;
import java.security.SecureRandom;
import java.util.*;

/** Opaque, bounded browser sessions, separate cookie names per gateway port. Never log tokens. */
public final class BrowserSessions {
    private record Session(long expires, String subject) {}
    private final Map<String, Session> sessions = new HashMap<>();
    private final String name;
    private final SecureRandom random = new SecureRandom();
    public BrowserSessions(int port) { name = "pp_branch_" + port; }
    public synchronized String issue(HttpExchange ex, long now) { return issue(ex, now, ""); }
    public synchronized String issue(HttpExchange ex, long now, String subject) {
        sessions.values().removeIf(t -> t.expires <= now);
        if (sessions.size() >= 100) throw new Http.ApiException(429, "Qua nhieu phien trinh duyet");
        byte[] bytes = new byte[24]; random.nextBytes(bytes);
        String token = HexFormat.of().formatHex(bytes);
        sessions.put(token, new Session(now + 12*3600000L, subject));
        ex.getResponseHeaders().add("Set-Cookie", name + "=" + token + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200");
        return token;
    }
    public synchronized boolean valid(HttpExchange ex, long now) {
        return valid(ex, now, "");
    }
    public synchronized boolean valid(HttpExchange ex, long now, String subject) {
        String token = token(ex); Session session = sessions.get(token);
        if (session == null) return false;
        if (session.expires <= now) { sessions.remove(token); return false; }
        return Objects.equals(session.subject, subject);
    }
    public synchronized void clear(HttpExchange ex) {
        sessions.clear();
        ex.getResponseHeaders().add("Set-Cookie", name + "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
    }
    public synchronized boolean validToken(String token, long now) {
        Session s = sessions.get(token);
        return s != null && s.expires > now;
    }
    public synchronized String sessionToken(HttpExchange ex) { return token(ex); }
    public synchronized void revoke(HttpExchange ex) {
        sessions.remove(token(ex));
        ex.getResponseHeaders().add("Set-Cookie", name + "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0");
    }
    private String token(HttpExchange ex) {
        for (String header : ex.getRequestHeaders().getOrDefault("Cookie", List.of()))
            for (String part : header.split(";")) if (part.trim().startsWith(name + "=")) return part.trim().substring(name.length()+1);
        return "";
    }
}
