package phanphoi.client;

import org.junit.jupiter.api.Test;
import phanphoi.common.Command;
import phanphoi.common.Message;
import phanphoi.common.ReconnectPolicy;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

class ReplenishmentTest {
    private BranchAgent agent() {
        return new BranchAgent("localhost", 9000, 9001, ReconnectPolicy.parse("fixed", 1000, 5000), new ClientSecurity(List.of(), 30));
    }

    @SuppressWarnings("unchecked")
    private BranchState.Request request(BranchAgent agent) {
        return ((List<BranchState.Request>) agent.snapshot().get("requests")).get(0);
    }

    @Test void acceptanceWaitsForAdminDispatchAndSurvivesRepeatedOffer() throws Exception {
        var agent = agent();
        agent.onMessage(null, Message.of(Command.OFFER, 10, "SP01", 10));
        agent.onMessage(null, Message.of(Command.ACCEPTED, 10, "SP01", 8));
        assertEquals("DA_CHAP_NHAN", request(agent).trangThai);
        assertEquals(8, request(agent).soLuongChot);
        assertNull(request(agent).soLuongGiao);
        agent.onMessage(null, Message.of(Command.OFFER, 10, "SP01", 10));
        assertEquals("DA_CHAP_NHAN", request(agent).trangThai);
        agent.onMessage(null, Message.of(Command.DELIVERED, 10, "SP01", 8));
        assertEquals("DA_GIAO", request(agent).trangThai);
        agent.onMessage(null, Message.of(Command.ACCEPTED, 10, "SP01", 8));
        assertEquals("DA_GIAO", request(agent).trangThai);
    }

    @Test void resyncCanRestoreAcceptedRequestWithoutAnOfferAndCannotReopenCompletedRequest() throws Exception {
        var agent = agent();
        agent.onMessage(null, Message.of(Command.ACCEPTED, 10, "SP01", 8));
        assertEquals("DA_CHAP_NHAN", request(agent).trangThai);
        agent.onMessage(null, Message.of(Command.RECEIVED_OK, 10, "SP01", 8, 8));
        agent.onMessage(null, Message.of(Command.ACCEPTED, 10, "SP01", 8));
        assertEquals("HOAN_TAT", request(agent).trangThai);
    }
}
