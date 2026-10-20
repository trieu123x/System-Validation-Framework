package phanphoi.loadsim;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/** Thống kê độ trễ: trung bình và phân vị. */
final class Stats {

    final int n;
    final double avg;
    final double p50;
    final double p95;
    final double p99;
    final double max;

    Stats(Collection<Double> values) {
        List<Double> v = new ArrayList<>(values);
        Collections.sort(v);
        n = v.size();
        avg = v.stream().mapToDouble(Double::doubleValue).average().orElse(0);
        p50 = pct(v, 50);
        p95 = pct(v, 95);
        p99 = pct(v, 99);
        max = v.isEmpty() ? 0 : v.get(v.size() - 1);
    }

    private static double pct(List<Double> sorted, double p) {
        if (sorted.isEmpty()) {
            return 0;
        }
        int idx = (int) Math.ceil(p / 100.0 * sorted.size()) - 1;
        return sorted.get(Math.max(0, Math.min(idx, sorted.size() - 1)));
    }

    static String f(double d) {
        return String.format(Locale.ROOT, "%.2f", d);
    }

    static String f1(double d) {
        return String.format(Locale.ROOT, "%.1f", d);
    }
}
