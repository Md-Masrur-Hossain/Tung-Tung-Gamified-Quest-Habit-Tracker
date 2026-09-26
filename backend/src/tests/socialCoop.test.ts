import { Types } from 'mongoose';
import { createParty, inviteToParty, createCoopQuest, getPartyCoopQuests, contributeToCoopQuest } from '../services/socialService';
import * as ps from '../services/progressionService';
import * as rs from '../services/rewardService';
import { User } from '../models/User';
import { Friendship } from '../models/Friendship';
import { Party } from '../models/Party';
import { CoopQuest } from '../models/CoopQuest';
const S = (v: any) => (v == null ? '' : typeof v === 'string' ? v : v.toString());
const oid = (id?: string) => (id ? new Types.ObjectId(id) : new Types.ObjectId());
const sv = (o: any) => { o.save = jest.fn(async function (this: any) { return this; }); return o; };
let U: any[] = []; let F: any[] = []; let P: any[] = []; let Qs: any[] = [];
const mkU = (o: any = {}) => { const u: any = sv({ _id: o._id || oid(), username: o.username || 'u', totalXP: 0, coins: 0 }); Object.assign(u, o); U.push(u); return u; };
const mkF = (a: string, b: string) => { const f: any = sv({ _id: oid(), requester: new Types.ObjectId(a), recipient: new Types.ObjectId(b), status: 'ACCEPTED' }); F.push(f); return f; };
const QQ = (v: any) => { const q: any = { select: jest.fn(() => q), limit: jest.fn(() => Promise.resolve(v)), populate: jest.fn(() => q), sort: jest.fn(() => Promise.resolve(v)) }; q.then = (a: any, b: any) => Promise.resolve(v).then(a, b); return q; };
beforeEach(() => {
  U = []; F = []; P = []; Qs = []; jest.clearAllMocks(); jest.restoreAllMocks();
  jest.spyOn(User, 'findById').mockImplementation(((id: any) => Promise.resolve(U.find((u) => S(u._id) === S(id)) || null) as any) as any);
  jest.spyOn(Friendship, 'findOne').mockImplementation(((fl: any = {}) => { const f = F.find((x) => { if (fl.status && x.status !== fl.status) return false; return (fl.$or || []).some((c: any) => (!c.requester || S(x.requester) === S(c.requester)) && (!c.recipient || S(x.recipient) === S(c.recipient))); }); return Promise.resolve(f || null) as any; }) as any);
  jest.spyOn(Party, 'create').mockImplementation((async (d: any) => { const doc: any = sv({ _id: oid(), ...d }); P.push(doc); return doc; }) as any);
  jest.spyOn(Party, 'findById').mockImplementation(((id: any) => Promise.resolve(P.find((p) => S(p._id) === S(id)) || null) as any) as any);
  jest.spyOn(CoopQuest, 'create').mockImplementation((async (d: any) => { const doc: any = sv({ _id: oid(), ...d, contributions: [] }); Qs.push(doc); return doc; }) as any);
  jest.spyOn(CoopQuest, 'findById').mockImplementation(((id: any) => Promise.resolve(Qs.find((x) => S(x._id) === S(id)) || null) as any) as any);
  jest.spyOn(CoopQuest, 'find').mockImplementation(((fl: any = {}) => QQ(Qs.filter((x) => (!fl.party || S(x.party) === S(fl.party))))) as any);
  jest.spyOn(ps, 'awardXp').mockImplementation((async (uid: any, amt: number) => { const u = U.find((x) => S(x._id) === S(uid)); u.totalXP += amt; return u; }) as any);
  jest.spyOn(rs, 'awardCoins').mockImplementation((async (uid: any, amt: number) => { const u = U.find((x) => S(x._id) === S(uid)); u.coins += amt; return u; }) as any);
});
describe('Sprint5 Coop 18-25', () => {
  beforeEach(() => { mkU({ _id: new Types.ObjectId(A), username: 'a' }); mkU({ _id: new Types.ObjectId(B), username: 'b' }); mkU({ _id: new Types.ObjectId(C), username: 'c' }); });
  test('18 non-member create blocked', async () => {
    const p = await partyAB();
    await expect(createCoopQuest(C, { partyId: p._id.toString(), title: 'X', category: 'Work' })).rejects.toThrow(/only party members/i);
  });
  test('19 non-member list blocked', async () => {
    const p = await partyAB();
    await createCoopQuest(A, { partyId: p._id.toString(), title: 'Real', category: 'Study' });
    await expect(getPartyCoopQuests(C, p._id.toString())).rejects.toThrow(/not authorized/i);
    expect(await getPartyCoopQuests(A, p._id.toString())).toHaveLength(1);
  });
  test('20 valid contribution recorded', async () => {
    const p = await partyAB();
    const q: any = await createCoopQuest(A, { partyId: p._id.toString(), title: 'Grind', category: 'Fitness', targetCount: 2 });
    const r: any = await contributeToCoopQuest(B, q._id.toString());
    expect(r.contributionsCount).toBe(1);
    expect(r.completed).toBe(false);
  });
  test('21 contribution belongs to caller', async () => {
    const p = await partyAB();
    const q: any = await createCoopQuest(A, { partyId: p._id.toString(), title: 'NoSpoof', category: 'Health', targetCount: 2 });
    await contributeToCoopQuest(A, q._id.toString());
    expect(q.contributions.map((c: any) => S(c.userId))).toEqual([A]);
  });
  test('22 non-member contribute blocked', async () => {
    const p = await partyAB();
    const q: any = await createCoopQuest(A, { partyId: p._id.toString(), title: 'MO', category: 'Home', targetCount: 2 });
    await expect(contributeToCoopQuest(C, q._id.toString())).rejects.toThrow(/only party members/i);
  });
  test('23 duplicate blocked', async () => {
    const p = await partyAB();
    const q: any = await createCoopQuest(A, { partyId: p._id.toString(), title: 'Once', category: 'Hobby', targetCount: 2 });
    await contributeToCoopQuest(A, q._id.toString());
    await expect(contributeToCoopQuest(A, q._id.toString())).rejects.toThrow(/already contributed/i);
  });
  test('24 target completion', async () => {
    const p = await partyAB();
    const q: any = await createCoopQuest(A, { partyId: p._id.toString(), title: 'Fin', category: 'Personal', targetCount: 2 });
    await contributeToCoopQuest(A, q._id.toString());
    const r: any = await contributeToCoopQuest(B, q._id.toString());
    expect(r.completed).toBe(true);
    expect(r.coopQuest.status).toBe('completed');
  });
  test('25 reward once via engines', async () => {
    const p = await partyAB();
    const q: any = await createCoopQuest(A, { partyId: p._id.toString(), title: 'Pay', category: 'Work', targetCount: 2 });
    const sx = jest.spyOn(ps, 'awardXp'); const sc = jest.spyOn(rs, 'awardCoins');
    await contributeToCoopQuest(A, q._id.toString());
    expect(sx).not.toHaveBeenCalled();
    await contributeToCoopQuest(B, q._id.toString());
    expect(sx).toHaveBeenCalledTimes(2);
    expect(sc).toHaveBeenCalledTimes(2);
    await expect(contributeToCoopQuest(A, q._id.toString())).rejects.toThrow(/already completed/i);
    expect(sx).toHaveBeenCalledTimes(2);
  });
});
const A = oid().toString(); const B = oid().toString(); const C = oid().toString();
async function partyAB() { const p: any = await createParty(A, 'Coop'); mkF(A, B); await inviteToParty(A, p._id.toString(), B); return p; }
