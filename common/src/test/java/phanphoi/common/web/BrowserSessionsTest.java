package phanphoi.common.web;

import com.sun.net.httpserver.*;
import org.junit.jupiter.api.Test;
import java.io.*;
import java.net.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class BrowserSessionsTest {
    static final class Exchange extends HttpExchange {
        final Headers request = new Headers(), response = new Headers();
        final ByteArrayOutputStream output = new ByteArrayOutputStream();
        int status; boolean closed; byte[] body = new byte[0];
        public Headers getRequestHeaders(){return request;}
        public Headers getResponseHeaders(){return response;}
        public URI getRequestURI(){return URI.create("http://localhost/api/state");}
        public String getRequestMethod(){return "GET";}
        public HttpContext getHttpContext(){return null;}
        public void close(){closed=true;}
        public InputStream getRequestBody(){return new ByteArrayInputStream(body);}
        public OutputStream getResponseBody(){return output;}
        public void sendResponseHeaders(int code,long n){status=code;}
        public InetSocketAddress getRemoteAddress(){return new InetSocketAddress("127.0.0.1",1234);}
        public int getResponseCode(){return status;}
        public InetSocketAddress getLocalAddress(){return new InetSocketAddress("127.0.0.1",8081);}
        public String getProtocol(){return "HTTP/1.1";}
        public Object getAttribute(String k){return null;}
        public void setAttribute(String k,Object v){}
        public void setStreams(InputStream in,OutputStream out){}
        public HttpPrincipal getPrincipal(){return null;}
        void acceptCookie(Exchange login){request.set("Cookie",login.response.getFirst("Set-Cookie").split(";",2)[0]);}
    }
    @Test void requiresOpaqueIssuedCookieAndCorrectBranch() {
        var sessions=new BrowserSessions(8081);var ex=new Exchange();
        assertFalse(sessions.valid(ex,1000,"CN01"));
        ex.request.set("Cookie","pp_branch_8081=forged");
        assertFalse(sessions.valid(ex,1000,"CN01"));
        var login=new Exchange();sessions.issue(login,1000,"CN01");ex.acceptCookie(login);
        assertTrue(sessions.valid(ex,1001,"CN01"));
        assertFalse(sessions.valid(ex,1001,"CN02"));
        assertTrue(login.response.getFirst("Set-Cookie").contains("HttpOnly; SameSite=Strict"));
    }
    @Test void separateGatewayPortsAndExpiry() {
        var one=new BrowserSessions(8081);var two=new BrowserSessions(8082);var login=new Exchange();
        one.issue(login,1000,"CN01");var ex=new Exchange();ex.acceptCookie(login);
        assertFalse(two.valid(ex,1001,"CN01"));
        assertFalse(one.valid(ex,1000+12*3600000L,"CN01"));
    }
    @Test void logoutRevokesAllBrowsers() {
        var sessions=new BrowserSessions(8081);var a=new Exchange();var b=new Exchange();
        sessions.issue(a,1000,"CN01");sessions.issue(b,1000,"CN01");
        var ra=new Exchange();ra.acceptCookie(a);var rb=new Exchange();rb.acceptCookie(b);
        sessions.clear(new Exchange());
        assertFalse(sessions.valid(ra,1001,"CN01"));assertFalse(sessions.valid(rb,1001,"CN01"));
    }
    @Test void capIsBoundedAndExpiredSessionsFreed() {
        var sessions=new BrowserSessions(8081);
        for(int i=0;i<100;i++)sessions.issue(new Exchange(),1000,"CN01");
        boolean rejected=false;
        try {sessions.issue(new Exchange(),1001,"CN01");}catch(Http.ApiException e){rejected=e.status()==429;}
        assertTrue(rejected);
        sessions.issue(new Exchange(),1000+12*3600000L,"CN01");
    }
    @Test void oversizedJsonRejectedBeforeParsing() throws Exception {
        var ex = new Exchange(); ex.body = new byte[65537];
        boolean rejected = false;
        try { Http.body(ex); } catch (Http.ApiException e) { rejected = e.status() == 413; }
        assertTrue(rejected);
    }
    @Test void sseChecksValidityBeforeWritingAndCapsConnections() throws Exception {
        var hub=new SseHub();
        try {
            var invalid=new Exchange();hub.open(invalid,null,()->false);assertEquals(401,invalid.status);assertEquals(0,hub.size());
            for(int i=0;i<64;i++)hub.open(new Exchange(),null,()->true);
            var overflow=new Exchange();hub.open(overflow,null,()->true);assertEquals(429,overflow.status);assertEquals(64,hub.size());
        } finally {hub.closeAll();}
        assertEquals(0,hub.size());
    }
}
