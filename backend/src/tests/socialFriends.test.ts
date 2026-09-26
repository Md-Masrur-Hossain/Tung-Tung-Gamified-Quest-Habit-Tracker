import { Types } from 'mongoose';
import { searchUsers, sendFriendRequest, acceptFriendRequest, rejectFriendRequest, getFriends, getIncomingRequests, getOutgoingRequests, removeFriend } from '../services/socialService';
import { User } from '../models/User';
import { Friendship } from '../models/Friendship';
const S = (v: any) => (v == null ? '' : typeof v === 'string' ? v : v.toString());
const oid = (id?: string) => (id ? new Types.ObjectId(id) : new Types.ObjectId());
const sv = (o: any) => { o.save = jest.fn(async function (this: any) { return this; }); return o; };
let U: any[] = []; let F: any[] = [];
const mkU = (o: any = {}) => { const u: any = sv({ _id: o._id || oid(), username: o.username || 'u' }); Object.assign(u, o); stFix(u); U.push(u); return u; };
function stFix(u: any) { u.totalXP = u.totalXP ?? 0; u.coins = u.coins ?? 0; u.longestStreak = u.longestStreak ?? 0; u.stats = u.stats ?? { questsCompleted: 0, bossesDefeated: 0 }; if (!u.save) sv(u); }
const pop = (r: any) => { if (!r || (typeof r === 'object' && (r as any).username)) return r; const f = U.find((u) => S(u._id) === S(r)); return f ? { _id: f._id, username: f.username } : r; };
const QQ = (v: any) => { const q: any = { select: jest.fn(() => q), limit: jest.fn(() => Promise.resolve(v)), populate: jest.fn(() => q), sort: jest.fn(() => Promise.resolve(v)) }; q.then = (a: any, b: any) => Promise.resolve(v).then(a, b); return q; };
beforeEach(() => {
  U = []; F = []; jest.clearAllMocks(); jest.restoreAllMocks();
  jest.spyOn(User, 'find').mockImplementation(((fl: any = {}) => { let r = [...U]; if (fl._id?.$ne) r = r.filter((u) => S(u._id) !== S(fl._id.$ne)); if (fl.username?.$regex !== undefined) { const re = new RegExp(fl.username.$regex, fl.username.$options || 'i'); r = r.filter((u) => re.test(u.username)); } return QQ(r); }) as any);
  jest.spyOn(User, 'findById').mockImplementation(((id: any) => Promise.resolve(U.find((u) => S(u._id) === S(id)) || null) as any) as any);
  jest.spyOn(User, 'findOne').mockImplementation(((fl: any = {}) => Promise.resolve(U.find((u) => (!fl.username || u.username === fl.username)) || null) as any) as any);
  jest.spyOn(Friendship, 'findOne').mockImplementation(((fl: any = {}) => { const ors = fl.$or || []; const f = F.find((x) => { if (fl.status && x.status !== fl.status) return false; if (!ors.length) return true; return ors.some((c: any) => (!c.requester || S(x.requester) === S(c.requester)) && (!c.recipient || S(x.recipient) === S(c.recipient))); }); return Promise.resolve(f || null) as any; }) as any);
  jest.spyOn(Friendship, 'findById').mockImplementation(((id: any) => Promise.resolve(F.find((x) => S(x._id) === S(id)) || null) as any) as any);
  jest.spyOn(Friendship, 'find').mockImplementation(((fl: any = {}) => { let r = [...F]; if (fl.status) r = r.filter((x) => x.status === fl.status); if (fl.recipient) r = r.filter((x) => S(x.recipient) === S(fl.recipient)); if (fl.requester) r = r.filter((x) => S(x.requester) === S(fl.requester)); if (fl.$or) r = r.filter((x) => fl.$or.some((c: any) => (c.requester && S(x.requester) === S(c.requester)) || (c.recipient && S(x.recipient) === S(c.recipient)))); return QQ(r.map((x) => ({ ...x, requester: pop(x.requester), recipient: pop(x.recipient) }))); }) as any);
  jest.spyOn(Friendship, 'create').mockImplementation((async (d: any) => { const doc: any = sv({ _id: oid(), ...d }); F.push(doc); return doc; }) as any);
  jest.spyOn(Friendship, 'findByIdAndDelete').mockImplementation(((id: any) => { const i = F.findIndex((x) => S(x._id) === S(id)); return Promise.resolve(i >= 0 ? F.splice(i, 1)[0] : null) as any; }) as any);
});

describe('Sprint5 Friends 1-8', () => {
  const a = oid().toString(); const b = oid().toString(); const c = oid().toString();
  test('1 search excludes self no secrets', async () => {
    mkU({ _id: new Types.ObjectId(a), username: 'alice' });
    mkU({ _id: new Types.ObjectId(b), username: 'bobby' });
    mkU({ _id: new Types.ObjectId(c), username: 'alice_cooper' });
    const r = await searchUsers(a, 'ali');
    expect(r).toHaveLength(1);
    expect((r[0] as any).username).toBe('alice_cooper');
    expect((r[0] as any).passwordHash).toBeUndefined();
  });
  test('2 self-request blocked', async () => {
    mkU({ _id: new Types.ObjectId(a), username: 'alice' });
    await expect(sendFriendRequest(a, a)).rejects.toThrow(/yourself/i);
  });
  test('3 request creation incoming/outgoing', async () => {
    mkU({ _id: new Types.ObjectId(a), username: 'alice' });
    mkU({ _id: new Types.ObjectId(b), username: 'bob' });
    const fr: any = await sendFriendRequest(a, b);
    expect(fr.status).toBe('PENDING');
    expect(await getOutgoingRequests(a)).toHaveLength(1);
    expect(await getIncomingRequests(b)).toHaveLength(1);
  });
  test('4 duplicate blocked', async () => {
    mkU({ _id: new Types.ObjectId(a), username: 'alice' });
    mkU({ _id: new Types.ObjectId(b), username: 'bob' });
    await sendFriendRequest(a, b);
    await expect(sendFriendRequest(a, b)).rejects.toThrow(/pending|already/i);
    await expect(sendFriendRequest(b, a)).rejects.toThrow(/pending|already/i);
  });
describe('Sprint5 Friends 5-8', () => {
  const a = oid().toString(); const b = oid().toString(); const c = oid().toString();
  test('5 accept lists friends', async () => {
    mkU({ _id: new Types.ObjectId(a), username: 'alice' });
    mkU({ _id: new Types.ObjectId(b), username: 'bob' });
    const fr: any = await sendFriendRequest(a, b);
    expect(((await acceptFriendRequest(b, fr._id.toString())) as any).status).toBe('ACCEPTED');
    expect(await getFriends(a)).toHaveLength(1);
  });
  test('6 reject lists nothing', async () => {
    mkU({ _id: new Types.ObjectId(a), username: 'alice' });
    mkU({ _id: new Types.ObjectId(b), username: 'bob' });
    const fr: any = await sendFriendRequest(a, b);
    expect(((await rejectFriendRequest(b, fr._id.toString())) as any).status).toBe('REJECTED');
    expect(await getFriends(a)).toHaveLength(0);
  });
  test('7 remove deletes', async () => {
    mkU({ _id: new Types.ObjectId(a), username: 'alice' });
    mkU({ _id: new Types.ObjectId(b), username: 'bob' });
    F.push(sv({ _id: oid(), requester: new Types.ObjectId(a), recipient: new Types.ObjectId(b), status: 'ACCEPTED' }));
    expect(await getFriends(a)).toHaveLength(1);
    await removeFriend(a, b);
    expect(await getFriends(a)).toHaveLength(0);
  });
  test('8 cross-user blocked', async () => {
    mkU({ _id: new Types.ObjectId(a), username: 'alice' });
    mkU({ _id: new Types.ObjectId(b), username: 'bob' });
    mkU({ _id: new Types.ObjectId(c), username: 'carol' });
    const fr: any = await sendFriendRequest(a, b);
    await expect(acceptFriendRequest(c, fr._id.toString())).rejects.toThrow(/not authorized/i);
    await expect(rejectFriendRequest(c, fr._id.toString())).rejects.toThrow(/not authorized/i);
    await expect(acceptFriendRequest(a, fr._id.toString())).rejects.toThrow(/not authorized/i);
  });
});

});
