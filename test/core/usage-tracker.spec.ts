import { CompletionUsage } from '../../src/interfaces/completion.interface';
import { UsageTracker, UsageTotals } from '../../src/core/usage-tracker';

function usage(
  promptTokens: number,
  completionTokens: number,
  estimatedCostUsd: number | null,
): CompletionUsage {
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    estimatedCostUsd,
  };
}

const ZERO_TOTALS: UsageTotals = {
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
  totalTokens: 0,
  totalEstimatedCostUsd: 0,
  requestCount: 0,
  requestsWithUnknownCost: 0,
};

describe('UsageTracker', () => {
  it('starts at zero', () => {
    expect(new UsageTracker().getTotals()).toEqual(ZERO_TOTALS);
  });

  it('accumulates tokens, cost and request count across requests', () => {
    const tracker = new UsageTracker();
    tracker.record(usage(10, 20, 0.01));
    tracker.record(usage(5, 15, 0.02));

    expect(tracker.getTotals()).toEqual({
      totalPromptTokens: 15,
      totalCompletionTokens: 35,
      totalTokens: 50,
      totalEstimatedCostUsd: 0.03,
      requestCount: 2,
      requestsWithUnknownCost: 0,
    });
  });

  it('counts unpriced requests without polluting the cost total', () => {
    const tracker = new UsageTracker();
    tracker.record(usage(10, 20, null));
    tracker.record(usage(10, 20, 0.05));

    const totals = tracker.getTotals();
    expect(totals.totalEstimatedCostUsd).toBe(0.05);
    expect(totals.requestsWithUnknownCost).toBe(1);
    expect(totals.requestCount).toBe(2);
    expect(totals.totalTokens).toBe(60);
  });

  it('resets all totals back to zero', () => {
    const tracker = new UsageTracker();
    tracker.record(usage(10, 20, 0.01));
    tracker.reset();

    expect(tracker.getTotals()).toEqual(ZERO_TOTALS);
  });

  it('returns a snapshot copy that does not mutate internal state', () => {
    const tracker = new UsageTracker();
    tracker.record(usage(10, 20, 0.01));

    const snapshot = tracker.getTotals();
    snapshot.totalPromptTokens = 9999;

    expect(tracker.getTotals().totalPromptTokens).toBe(10);
  });
});
