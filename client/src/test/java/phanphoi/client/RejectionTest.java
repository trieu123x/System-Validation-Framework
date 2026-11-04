package phanphoi.client;

import org.junit.jupiter.api.Test;
import phanphoi.common.Command;
import phanphoi.common.Message;
import phanphoi.common.ReconnectPolicy;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import static org.junit.jupiter.api.Assertions.*;

class RejectionTest {
    private BranchAgent agent() {
        return new BranchAgent("localhost", 9000, 9001, ReconnectPolicy.parse("fixed", 1000, 5000), new ClientSecurity(List.of(), 30));
    }

    @SuppressWarnings("unchecked")
    private Map<Integer, CompletableFuture<Void>> calls(BranchAgent agent) throws Exception {
        var field = BranchAgent.class.getDeclaredField("rejectionCalls");
        field.setAccessible(true);
        return (Map<Integer, CompletableFuture<Void>>) field.get(agent);
    }

    @SuppressWarnings("unchecked")
    private BranchState.Request request(BranchAgent agent) {
        return ((List<BranchState.Request>) agent.snapshot().get("requests")).get(0);
    }

    @Test void serverErrorDoesNotCloseDeliveryOrCompleteAsSuccess() throws Exception {
        var agent = agent();
        agent.onMessage(null, Message.of(Command.DELIVERED, 10, "SP01", 5));
        var result = new CompletableFuture<Void>();
        calls(agent).put(10, result);
        agent.onMessage(null, Message.of(Command.REJECT_RESULT, 10, "ERROR", "Đơn đã thay đổi"));
        assertTrue(result.isCompletedExceptionally());
        assertEquals("DA_GIAO", request(agent).trangThai);
    }

    @Test void committedRefusalSurvivesOldDeliveryMessagesAndResync() throws Exception {
        var agent = agent();
        agent.onMessage(null, Message.of(Command.DELIVERED, 10, "SP01", 5));
        var result = new CompletableFuture<Void>();
        calls(agent).put(10, result);
        agent.onMessage(null, Message.of(Command.REJECT_RESULT, 10, "OK", "SP01"));
        assertTrue(result.isDone());
        assertFalse(result.isCompletedExceptionally());
        assertEquals("TU_CHOI", request(agent).trangThai);
        agent.onMessage(null, Message.of(Command.DELIVERED, 10, "SP01", 5));
        assertEquals("TU_CHOI", request(agent).trangThai);
        agent.onMessage(null, Message.of(Command.REJECT_RESULT, 10, "OK", "SP01"));
        assertEquals("TU_CHOI", request(agent).trangThai);
    }
}
