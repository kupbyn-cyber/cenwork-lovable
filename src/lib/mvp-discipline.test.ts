import { describe, it, expect } from "vitest";
import { computeMvpScore, evaluateReporting, type MvpReportObligationInput } from "@/lib/mvp-scoring";

const day = (d: string, state: "completed"|"missing"|"exempt"): MvpReportObligationInput =>
  ({ kind: "daily", periodKey: d, dueAt: `${d}T10:00:00Z`, state, source: "derived" });

const base = {
  tasks: [{ weight: 2, status: "done", deadline: "2026-08-14T10:00:00Z", completedAt: "2026-08-13T10:00:00Z", isCommitted: true }],
  votesReceived: 0, topVotes: 0, review: null,
};

describe("reporting", () => {
  it("case1 5/5", () => {
    const r = evaluateReporting(["10","11","12","13","14"].map(d => day(`2026-08-${d}`, "completed")), 13);
    expect(r.ratio).toBe(1); expect(r.score).toBe(13);
  });
  it("case2 exempt 2 days", () => {
    const items = [day("2026-08-10","completed"),day("2026-08-11","completed"),day("2026-08-12","completed"),day("2026-08-13","exempt"),day("2026-08-14","exempt")];
    const r = evaluateReporting(items, 13);
    expect(r.required).toBe(3); expect(r.ratio).toBe(1); expect(r.exempt).toBe(2);
  });
  it("case3 4/5", () => {
    const items = ["10","11","12","13"].map(d=>day(`2026-08-${d}`,"completed")).concat([day("2026-08-14","missing")]);
    expect(evaluateReporting(items,13).ratio).toBe(0.8);
  });
  it("case4 admin no obligation -> not applicable, announcement takes 15", () => {
    const res = computeMvpScore({ ...base, reportObligations: [],
      announcements: [{ announcementId:"a", title:"t", dueAt:"2026-08-12T10:00:00Z", receivedAt:"2026-08-10T01:00:00Z", acknowledgedAt:"2026-08-12T09:00:00Z", isRevoked:false, isExempt:false, exemptReason:null }],
      announcementLockAt: "2026-08-16T00:00:00Z" });
    const rep = res.components.find(c=>c.criterion==="reporting")!;
    const ann = res.components.find(c=>c.criterion==="announcement")!;
    expect(rep.isApplicable).toBe(false); expect(rep.earnedPoints).toBe(0); expect(rep.maxPoints).toBe(0);
    expect(ann.maxPoints).toBe(15); expect(ann.earnedPoints).toBe(15);
  });
  it("case5 new hire 3/3", () => {
    const items = ["12","13","14"].map(d=>day(`2026-08-${d}`,"completed"));
    expect(evaluateReporting(items,13).ratio).toBe(1);
  });
  it("neither discipline applies -> no free points, completeness ignores them", () => {
    const res = computeMvpScore({ ...base, reportObligations: [], announcements: [], announcementLockAt: "2026-08-16T00:00:00Z" });
    const rep = res.components.find(c=>c.criterion==="reporting")!;
    const ann = res.components.find(c=>c.criterion==="announcement")!;
    expect(rep.earnedPoints+ann.earnedPoints).toBe(0);
    expect(rep.maxPoints+ann.maxPoints).toBe(0);
    expect(res.dataCompleteness).toBeGreaterThan(0);
  });
});

describe("announcements", () => {
  const mk = (o: any) => computeMvpScore({ ...base, reportObligations: [day("2026-08-10","completed")], announcements:[o], announcementLockAt:"2026-08-16T00:00:00Z" }).components.find(c=>c.criterion==="announcement")!;
  it("on time", () => {
    const c = mk({ announcementId:"a", title:"", dueAt:"2026-08-10T10:00:00Z", receivedAt:"2026-08-06T01:00:00Z", acknowledgedAt:"2026-08-10T09:00:00Z", isRevoked:false, isExempt:false, exemptReason:null });
    expect(c.earnedPoints).toBe(2);
  });
  it("late 6h -> 0.75", () => {
    const c = mk({ announcementId:"a", title:"", dueAt:"2026-08-10T10:00:00Z", receivedAt:"2026-08-06T01:00:00Z", acknowledgedAt:"2026-08-10T16:00:00Z", isRevoked:false, isExempt:false, exemptReason:null });
    expect(c.earnedPoints).toBe(1.5);
  });
  it("due changed after overdue keeps late", () => {
    const c = mk({ announcementId:"a", title:"", dueAt:"2026-08-11T10:00:00Z", receivedAt:"2026-08-06T01:00:00Z", acknowledgedAt:"2026-08-11T03:00:00Z", isRevoked:false, isExempt:false, exemptReason:null, dueChangedAfterOverdue:true, gradingDueAt:"2026-08-10T10:00:00Z" });
    expect(c.earnedPoints).toBeLessThan(2);
    expect((c.sourceData as any).items[0].bucket).toBe("late_24");
  });
  it("revoked excluded", () => {
    const c = mk({ announcementId:"a", title:"", dueAt:"2026-08-10T10:00:00Z", receivedAt:"2026-08-06T01:00:00Z", acknowledgedAt:null, isRevoked:true, isExempt:false, exemptReason:null });
    expect(c.isApplicable).toBe(false);
  });
});
