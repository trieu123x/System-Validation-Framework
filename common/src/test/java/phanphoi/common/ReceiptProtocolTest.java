package phanphoi.common;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class ReceiptProtocolTest {
    @Test
    void receiptRequiresActualCount() throws Exception {
        assertThrows(ProtocolException.class, () -> Protocol.decode("RECEIVED|7"));
        assertThrows(ProtocolException.class, () -> Protocol.decode("RECEIVED|7|8|9"));
        for (int actual : new int[]{0, 8, 10, 12}) {
            assertEquals(actual, Protocol.decode(Message.of(Command.RECEIVED, 7, actual).toLine()).intParam(1));
        }
    }

    @Test
    void acknowledgmentCarriesBothExpectedAndActualCounts() throws Exception {
        var m = Protocol.decode("RECEIVED_OK|7|SP01|10|8");
        assertEquals(Command.RECEIVED_OK, m.command());
        assertEquals(10, m.intParam(2));
        assertEquals(8, m.intParam(3));
    }

    @Test
    void fractionalAndOverflowCountsAreRejected() {
        for (String count : new String[]{"", "1.5", "NaN", "2147483648"}) {
            assertThrows(ProtocolException.class, () -> Protocol.decode("RECEIVED|7|" + count).intParam(1));
        }
    }
}
