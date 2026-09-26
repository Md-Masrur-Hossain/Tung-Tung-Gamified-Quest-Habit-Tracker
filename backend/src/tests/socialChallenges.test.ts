import { Types } from 'mongoose';
import { createChallenge, acceptChallenge, declineChallenge, getUserChallenges, syncChallengeProgress, recordChallengeProgress, getGameplayMetric } from '../services/socialService';
import * as ps from '../services/progressionService';
import * as rs from '../services/rewardService';
import { User } from '../models/User';
import { Friendship } from '../models/Friendship';
import { Challenge } from '../models/Challenge';
const S = (v: any) => (v == null ? '' : typeof v === 'string' ? v : v.toString());
const oid = (id?: string) => (id ? new Types.ObjectId(id) : new Types.ObjectId());
const sv = (o: any) => { o.save = jest.fn(async function (this: any) { return this; }); return o; };
let U: any[] = []; let F: any[] = []; let CH: any[] = [];
const mkU = (o: any = {}) => { const u: any = sv({ _id: o._id || oid(), username: o.username || 'u', totalXP: 0, coins: 0, longestStreak: 0, stats: { questsCompleted: 0, bossesDefeated: 0 } }); Object.assign(u, o); U.push(u); return u; };
const QQ = (v: any) => { const q: any = { select: jest.fn(() => q), limit: jest.fn(() => Promise.resolve(v)), populate: jest.fn(() => q), sort: jest.fn(() => Promise.resolve(v)) }; q.then = (a: any, b: any) => Promise.resolve(v).then(a, b); return q; };
beforeEach(() => {
  U = []; F = []; CH = []; jest.clearAllMocks(); jest.restoreAllMocks();
  jest.spyOn(User, 'findById').mockImplementation(((id: any) => Promise.resolve(U.find((u) => S(u._id) === S(id)) || null) as any) as any);
  jest.spyOn(Friendship, 'findOne').mockImplementation(((fl: any = {}) => { const f = F.find((x) => { if (fl.status && x.status !== fl.status) return false; return (fl.$or || []).some((c: any) => (!c.requester || S(x.requester) === S(c.requester)) && (!c.recipient || S(x.recipient) === S(c.recipient))); }); return Promise.resolve(f || null) as any; }) as any);
  jest.spyOn(Challenge, 'create').mockImplementation((async (d: any) => { const doc: any = sv({ _id: oid(), ...d }); CH.push(doc); return doc; }) as any);
  jest.spyOn(Challenge, 'findById').mockImplementation(((id: any) => Promise.resolve(CH.find((x) => S(x._id) === S(id)) || null) as any) as any);
  jest.spyOn(Challenge, 'find').mockImplementation(((fl: any = {}) => { let r = [...CH]; if (fl.$or) r = r.filter((x) => fl.$or.some((c: any) => (c.challenger && S(x.challenger) === S(c.challenger)) || (c.challenged && S(x.challenged) === S(c.challenged)))); return QQ(r); }) as any);
  jest.spyOn(ps, 'awardXp').mockImplementation((async (uid: any, amt: number) => { const u = U.find((x) => S(x._id) === S(uid)); u.totalXP += amt; return u; }) as any);
  jest.spyOn(rs, 'awardCoins').mockImplementation((async (uid: any, amt: number) => { const u = U.find((x) => S(x._id) === S(uid)); u.coins += amt; return u; }) as any);
});
const A = oid().toString(); const B = oid().toString(); const C = oid().toString();
describe('Sprint5 Challenges 26-32', () => {
  beforeEach(seed);
  test('26 create between friends', async () => {
    const c: any = await createChallenge(A, { challengedId: B, title: 'First', goalType: 'QUEST_COUNT', target: 3 });
    expect(c.status).toBe('PENDING');
  });
  test('27 self blocked', async () => {
    await expect(createChallenge(A, { challengedId: A, title: 'Solo', goalType: 'QUEST_COUNT', target: 1 })).rejects.toThrow(/yourself/i);
  });
  test('28 non-friend blocked', async () => {
    await expect(createChallenge(A, { challengedId: C, title: 'Stranger', goalType: 'QUEST_COUNT', target: 1 })).rejects.toThrow(/confirmed friends/i);
  });
  test('29 goal types enforced', async () => {
    await expect(createChallenge(A, { challengedId: B, title: 'Bad', goalType: 'FAKE' as any, target: 1 })).rejects.toThrow(/invalid goal type/i);
    for (const g of ['QUEST_COUNT', 'XP_EARNED', 'STREAK'] as const) {
      const c: any = await createChallenge(A, { challengedId: B, title: g, goalType: g, target: 1 });
      expect(c.goalType).toBe(g);
    }
  });
  test('30 accept captures baselines', async () => {
    const c: any = await createChallenge(A, { challengedId: B, title: 'Accept', goalType: 'QUEST_COUNT', target: 2 });
    const ac: any = await acceptChallenge(B, c._id.toString());
    expect(ac.status).toBe('ACCEPTED');
    expect(ac.baselinesSet).toBe(true);
  });
  test('31 decline flow', async () => {
    const c: any = await createChallenge(A, { challengedId: B, title: 'No', goalType: 'QUEST_COUNT', target: 2 });
    expect(((await declineChallenge(B, c._id.toString())) as any).status).toBe('DECLINED');
  });
  test('32 progress from real data', async () => {
    const ch: any = await mkAcc('QUEST_COUNT', 2);
    U.find((u) => S(u._id) === B).stats.questsCompleted = 2;
    const s: any = await syncChallengeProgress(B, ch._id.toString());
    expect(s.challengedProgress).toBe(2);
    expect(s.status).toBe('COMPLETED');
    expect(S(s.winner)).toBe(B);
  });
});
describe('Sprint5 Challenges 33-38', () => {
  beforeEach(seed);
  test('33 client amount ignored', async () => {
    const ch: any = await mkAcc('QUEST_COUNT', 5);
    const s: any = await recordChallengeProgress(B, ch._id.toString(), 9999 as any);
    expect(s.challengedProgress).toBe(0);
    expect(s.status).toBe('ACCEPTED');
  });
  test('34 completion correctness', async () => {
    const ch: any = await mkAcc('XP_EARNED', 100);
    U.find((u) => S(u._id) === A).totalXP = 150;
    const s: any = await syncChallengeProgress(A, ch._id.toString());
    expect(s.status).toBe('COMPLETED');
    expect(S(s.winner)).toBe(A);
  });
  test('35 reward exactly once', async () => {
    const ch: any = await mkAcc('QUEST_COUNT', 1);
    const sx = jest.spyOn(ps, 'awardXp'); const sc = jest.spyOn(rs, 'awardCoins');
    U.find((u) => S(u._id) === B).stats.questsCompleted = 1;
    await syncChallengeProgress(B, ch._id.toString());
    expect(sx).toHaveBeenCalledTimes(1);
    expect(sc).toHaveBeenCalledTimes(1);
    await expect(syncChallengeProgress(B, ch._id.toString())).rejects.toThrow(/inactive/i);
    expect(sx).toHaveBeenCalledTimes(1);
  });
  test('36 unauthorized blocked', async () => {
    const ch: any = await mkAcc('QUEST_COUNT', 2);
    await expect(syncChallengeProgress(C, ch._id.toString())).rejects.toThrow(/not authorized/i);
    const p: any = await createChallenge(A, { challengedId: B, title: 'P', goalType: 'STREAK', target: 2 });
    await expect(acceptChallenge(C, p._id.toString())).rejects.toThrow(/not authorized/i);
    await expect(declineChallenge(C, p._id.toString())).rejects.toThrow(/not authorized/i);
  });
  test('37 list scoped', async () => {
    await createChallenge(A, { challengedId: B, title: 'Scoped', goalType: 'STREAK', target: 3 });
    expect((await getUserChallenges(A)).length).toBeGreaterThanOrEqual(1);
    expect((await getUserChallenges(B)).length).toBeGreaterThanOrEqual(1);
    expect(await getUserChallenges(C)).toHaveLength(0);
  });
  test('38 rewards fixed server-side', async () => {
    const c: any = await createChallenge(A, { challengedId: B, title: 'NoMint', goalType: 'QUEST_COUNT', target: 1, xpReward: 999999, coinReward: 999999 } as any);
    expect(c.xpReward).toBe(50);
    expect(c.coinReward).toBe(25);
    expect(getGameplayMetric(U.find((u) => S(u._id) === A), 'STREAK')).toBe(0);
  });
});
function seed() { mkU({ _id: new Types.ObjectId(A), username: 'a' }); mkU({ _id: new Types.ObjectId(B), username: 'b' }); mkU({ _id: new Types.ObjectId(C), username: 'c' }); F.push(sv({ _id: oid(), requester: new Types.ObjectId(A), recipient: new Types.ObjectId(B), status: 'ACCEPTED' })); }
const mkAcc = async (g: any = 'QUEST_COUNT', t = 2) => { const c: any = await createChallenge(A, { challengedId: B, title: 'Duel', goalType: g, target: t }); return acceptChallenge(B, c._id.toString()); };
