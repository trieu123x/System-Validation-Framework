package phanphoi.common.security;

import phanphoi.common.Config;
import java.util.*;
import java.util.concurrent.*;

/** Dependency-free acceptance suite: also invoked from JUnit. No real network or email recipients. */
public final class ScrapingAcceptance {
    private static int checks;
    private static void check(boolean value, String name) {
        checks++; if (!value) throw new AssertionError(name);
    }
    private static ScrapingGuard guard(String... extra) throws Exception {
        List<String> args = new ArrayList<>(List.of("scraping.mode=block", "scraping.tcp.max.per.window=10", "scraping.http.max.per.window=10"));
        args.addAll(List.of(extra));
        return new ScrapingGuard(ScrapingPolicy.from(Config.load("__missing_test_config__.properties", args.toArray(String[]::new))));
    }
    private static ScrapingGuard.Decision read(ScrapingGuard g, String account, long now) {
        return g.evaluate(account, "192.0.2.1", "TCP", "INVENTORY_GET", 0, now);
    }
    public static void main(String[] args) throws Exception {
        long t = 1000000;
        var g = guard();
        for (int i=0;i<10;i++) check(!read(g,"branch:CN01",t+i).denied(), "normal quota allowed");
        var limited = read(g,"branch:CN01",t+10);
        check(limited.action().equals("THROTTLE") && limited.retryAfter()>0, "quota returns retry");
        check(!read(g,"branch:CN02",t+11).denied(), "same NAT different branch unaffected");
        for (int i=0;i<15;i++) read(g,"branch:CN01",t+20+i);
        check(g.blocks(t+50).size()==1, "persistent abuse becomes account block");
        var b = g.blocks(t+50).get(0);
        var restarted = guard(); restarted.restore(b,t+51);
        check(read(restarted,"branch:CN01",t+52).action().equals("TEMP_BLOCK"), "restored block enforced");
        check(!read(restarted,"branch:CN02",t+53).denied(), "restored block isolated");
        restarted.revoke("branch:CN01");
        check(!read(restarted,"branch:CN01",t+54).denied(), "revoke clears evidence");
        check(!read(g,"branch:CN01",b.expiresAt()+61000).denied(), "expiry allows account again");
        var observe = guard("scraping.mode=detect");
        for(int i=0;i<100;i++) check(!read(observe,"branch:CN01",t+i).denied(), "detect never blocks");
        check(observe.blocks(t+100).isEmpty(), "detect does not create blocks");
        var off = guard("scraping.mode=off");
        for(int i=0;i<100;i++) check(!read(off,"branch:CN01",t+i).emit(), "off emits nothing");
        var legacy = off.evaluate("branch:CN01","127.0.0.1","TCP","INVENTORY_GET",0,t,true);
        check(legacy.denied(), "legacy protection preserved with new rules off");
        var broad = guard().evaluate("branch:CN01","127.0.0.1","TCP","HISTORY_GET",Long.MAX_VALUE,t);
        check(broad.denied() && broad.signals().contains("BROAD_HISTORY"), "broad history bounded");
        var expiry = guard();
        for(int i=0;i<11;i++) read(expiry,"branch:CN01",t+i);
        check(!read(expiry,"branch:CN01",t+61000).denied(), "sliding window expires");
        var combined = guard();
        for(int i=0;i<6;i++) read(combined,"branch:CN01",t+i);
        for(int i=0;i<4;i++) check(!combined.evaluate("branch:CN01","127.0.0.1","HTTP","/api/state",0,t+20+i).denied(), "combined quota boundary");
        check(combined.evaluate("branch:CN01","127.0.0.1","HTTP","/api/state",0,t+30).denied(), "HTTP TCP account aggregate");
        var capacity = guard("scraping.max.subjects=10");
        for(int i=0;i<10;i++) read(capacity,"branch:"+i,t);
        check(!read(capacity,"branch:NEW",t).denied(), "overflow cannot block unrelated identity");
        check(((Number)capacity.summary(t).get("subjects")).intValue()==10, "bounded state");
        check(((Number)capacity.summary(t).get("capacityMisses")).intValue()==1, "overflow visible");
        read(capacity,"branch:NEW",t+700000);
        check(((Number)capacity.summary(t+700000).get("subjects")).intValue()==1, "idle TTL cleanup");
        var concurrent = guard("scraping.mode=detect", "scraping.tcp.max.per.window=1000");
        ExecutorService pool=Executors.newFixedThreadPool(8); List<Future<?>> futures=new ArrayList<>();
        for(int i=0;i<8;i++) futures.add(pool.submit(() -> { for(int j=0;j<100;j++) read(concurrent,"branch:CN01",t); }));
        for(Future<?> f:futures) f.get(); pool.shutdown();
        check(read(concurrent,"branch:CN01",t).count()==801,"atomic concurrent counts");
        var distinct=guard("scraping.mode=detect");
        for(int i=0;i<12;i++) distinct.evaluate("branch:CN01","192.0.2."+(i%3),"TCP","INVENTORY_GET",0,t+i);
        check(distinct.evaluate("branch:CN01","192.0.2.1","TCP","INVENTORY_GET",0,t+13).signals().contains("MULTIPLE_IPS"),"multiple sessions/IP account tracking");
        boolean invalid=false;
        try {guard("scraping.mode=typo");} catch(IllegalArgumentException e){invalid=true;}
        check(invalid,"invalid mode rejected");
        invalid=false;try {guard("scraping.risk.warning=80","scraping.risk.block=70");}catch(IllegalArgumentException e){invalid=true;}
        check(invalid,"threshold order validated");
        var resource = guard("scraping.resource.quotas=HISTORY_GET=2");
        check(!resource.evaluate("branch:CN01", "127.0.0.1", "TCP", "HISTORY_GET", 1, t).denied(), "resource first allowed");
        resource.evaluate("branch:CN01", "127.0.0.1", "TCP", "HISTORY_GET", 1, t+1);
        check(resource.evaluate("branch:CN01", "127.0.0.1", "TCP", "HISTORY_GET", 1, t+2).denied(), "resource quota independent of account limit");
        check(!read(resource,"branch:CN01",t+3).denied(), "other resource still allowed before aggregate quota");
        System.out.println("PASS: " + checks + " anti-scraping core assertions");
    }
}
