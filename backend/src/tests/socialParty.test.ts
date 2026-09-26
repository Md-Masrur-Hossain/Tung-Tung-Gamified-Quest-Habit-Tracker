import { Types } from 'mongoose';
import { createParty, getPartyById, getUserParties, inviteToParty, removeFromParty, leaveParty } from '../services/socialService';
import { User } from '../models/User';
import { Friendship } from '../models/Friendship';
import { Party } from '../models/Party';
const S = (v: any) => (v == null ? '' : typeof v === 'string' ? v : v.toString());
const oid = (id?: string) => (id ? new Types.ObjectId(id) : new Types.ObjectId());
const sv = (o: any) => { o.save = jest.fn(async function (this: any) { return this; }); return o; };
let U: any[] = []; let F: any[] = []; let P: any[] = [];
const mkU = (o: any = {}) => { const u: any = sv({ _id: o._id || oid(), username: o.username || 'u' }); Object.assign(u, o); U.push(u); return u; };
const mkF = (a: string, b: string) => { const f: any = sv({ _id: oid(), requester: new Types.ObjectId(a), recipient: new Types.ObjectId(b), status: 'ACCEPTED' }); F.push(f); return f; };
const pop = (r: any) => { if (!r || (typeof r === 'object' && (r as any).username)) return r; const f = U.find((u) => S(u._id) === S(r)); return f ? { _id: f._id, username: f.username } : r; };
const QQ = (v: any) => { const q: any = { select: jest.fn(() => q), limit: jest.fn(() => Promise.resolve(v)), populate: jest.fn(() => q), sort: jest.fn(() => Promise.resolve(v)) }; q.then = (a: any, b: any) => Promise.resolve(v).then(a, b); return q; };
beforeEach(() => {
  U = []; F = []; P = []; jest.clearAllMocks(); jest.restoreAllMocks();
  jest.spyOn(User, 'findById').mockImplementation(((id: any) => Promise.resolve(U.find((u) => S(u._id) === S(id)) || null) as any) as any);
  jest.spyOn(Friendship, 'findOne').mockImplementation(((fl: any = {}) => { const f = F.find((x) => { if (fl.status && x.status !== fl.status) return false; return (fl.$or || []).some((c: any) => (!c.requester || S(x.requester) === S(c.requester)) && (!c.recipient || S(x.recipient) === S(c.recipient))); }); return Promise.resolve(f || null) as any; }) as any);
  jest.spyOn(Party, 'create').mockImplementation((async (d: any) => { const doc: any = sv({ _id: oid(), ...d }); P.push(doc); return doc; }) as any);
  jest.spyOn(Party, 'findById').mockImplementation(((id: any) => Promise.resolve(P.find((p) => S(p._id) === S(id)) || null) as any) as any);
  (jest.spyOn(Party, 'findOne') as any).mockImplementation((fl: any = {}) => { const f = P.find((p) => (!fl._id || S(p._id) === S(fl._id)) && (!fl.status || p.status === fl.status)); if (!f) return QQ(null); return QQ({ ...f, leader: pop(f.leader), members: (f.members || []).map(pop), save: f.save }); });
  jest.spyOn(Party, 'find').mockImplementation(((fl: any = {}) => { let r = [...P]; if (fl.status) r = r.filter((p) => p.status === fl.status); if (fl.members) r = r.filter((p) => (p.members || []).some((m: any) => S(m) === S(fl.members))); return QQ(r); }) as any);
});
const A = oid().toString(); const B = oid().toString(); const C = oid().toString();
const D = oid().toString(); const E = oid().toString(); const G = oid().toString();
describe('Sprint5 Party 9-17', () => {
  beforeEach(() => { mkU({ _id: new Types.ObjectId(A), username: 'a' }); mkU({ _id: new Types.ObjectId(B), username: 'b' }); mkU({ _id: new Types.ObjectId(C), username: 'c' }); mkU({ _id: new Types.ObjectId(D), username: 'd' }); mkU({ _id: new Types.ObjectId(E), username: 'e' }); mkU({ _id: new Types.ObjectId(G), username: 'g' }); });
  test('9 create leader member', async () => {
    const p: any = await createParty(A, 'Dragons');
    expect(S(p.leader)).toBe(A);
    expect(p.members.map(S)).toEqual([A]);
  });
  test('10 leader ownership enforced', async () => {
    mkF(A, B);
    const p: any = await createParty(A, 'F');
    await inviteToParty(A, p._id.toString(), B);
    mkF(B, C);
    await expect(inviteToParty(B, p._id.toString(), C)).rejects.toThrow(/only the party leader/i);
    await expect(removeFromParty(B, p._id.toString(), A)).rejects.toThrow(/only the party leader/i);
  });
  test('11 non-friend invite blocked', async () => {
    const p: any = await createParty(A, 'Lone');
    await expect(inviteToParty(A, p._id.toString(), D)).rejects.toThrow(/confirmed friends/i);
  });
  test('12 invite adds member visible', async () => {
    mkF(A, B);
    const p: any = await createParty(A, 'Dawn');
    await inviteToParty(A, p._id.toString(), B);
    const f: any = await getPartyById(B, p._id.toString());
    expect(f).toBeDefined();
    expect(await getUserParties(B)).toHaveLength(1);
  });
  test('13 duplicate membership blocked', async () => {
    mkF(A, B);
    const p: any = await createParty(A, 'Echo');
    await inviteToParty(A, p._id.toString(), B);
    await expect(inviteToParty(A, p._id.toString(), B)).rejects.toThrow(/already a member/i);
  });
});

describe('Sprint5 Party 14-17', () => {
  beforeEach(() => { mkU({ _id: new Types.ObjectId(A), username: 'a' }); mkU({ _id: new Types.ObjectId(B), username: 'b' }); mkU({ _id: new Types.ObjectId(C), username: 'c' }); mkU({ _id: new Types.ObjectId(D), username: 'd' }); mkU({ _id: new Types.ObjectId(E), username: 'e' }); mkU({ _id: new Types.ObjectId(G), username: 'g' }); });
  test('14 max 4 enforced', async () => {
    mkF(A, B); mkF(A, C); mkF(A, D); mkF(A, E);
    const p: any = await createParty(A, 'Full');
    await inviteToParty(A, p._id.toString(), B);
    await inviteToParty(A, p._id.toString(), C);
    await inviteToParty(A, p._id.toString(), D);
    expect(p.members).toHaveLength(4);
    await expect(inviteToParty(A, p._id.toString(), E)).rejects.toThrow(/full|maximum 4/i);
  });
  test('15 non-member read blocked', async () => {
    const p: any = await createParty(A, 'Secret');
    await expect(getPartyById(G, p._id.toString())).rejects.toThrow(/not authorized/i);
  });
  test('16 member leave keeps active', async () => {
    mkF(A, B);
    const p: any = await createParty(A, 'Nomad');
    await inviteToParty(A, p._id.toString(), B);
    const af: any = await leaveParty(B, p._id.toString());
    expect(af.members.map(S)).not.toContain(B);
    expect(af.status).toBe('ACTIVE');
  });
  test('17 leader transfer then disband', async () => {
    mkF(A, B);
    const p: any = await createParty(A, 'Succ');
    await inviteToParty(A, p._id.toString(), B);
    const t: any = await leaveParty(A, p._id.toString());
    expect(S(t.leader)).toBe(B);
    const d2: any = await leaveParty(B, p._id.toString());
    expect(d2.status).toBe('DISBANDED');
  });
});

