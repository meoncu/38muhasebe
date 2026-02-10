import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ChevronLeft, Users, Shield, Info, Copy, Check, Loader2, Home, Folder, PieChart, Settings, Plus, Minus, TrendingUp, TrendingDown, X, Clock, Trash2, UserCircle, Edit2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { db } from '@/lib/firebase';
import { doc, setDoc, updateDoc, query, collection, where, onSnapshot, addDoc, Timestamp, limit, deleteDoc, writeBatch } from 'firebase/firestore';

const STORAGE_LOCATIONS = ['Kasa', 'Babada', 'Annede', 'Bankada', 'Kendisinde', 'Kumbarada'];
const CURRENCIES = [
    { code: 'TRY', symbol: '₺', label: 'TL' },
    { code: 'USD', symbol: '$', label: 'Dolar' },
    { code: 'EUR', symbol: '€', label: 'Euro' }
];

import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

export default function FamilyPage() {
    const navigate = useNavigate();
    const { user, impersonatedUser, setImpersonatedUser } = useAuthStore();
    const activeUser = impersonatedUser || user;
    const [familyId, setFamilyId] = useState<string | null>(null);
    const [members, setMembers] = useState<any[]>([]);
    const [inviteId, setInviteId] = useState("");
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(true);
    const [myRole, setMyRole] = useState<'admin' | 'member'>('member');

    // Management State
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [selectedMember, setSelectedMember] = useState<any>(null);
    const [transType, setTransType] = useState<'income' | 'expense'>('income');
    const [transAmount, setTransAmount] = useState("");
    const [transName, setTransName] = useState("");
    const [transNote, setTransNote] = useState("");
    const [transLocation, setTransLocation] = useState(STORAGE_LOCATIONS[0]);
    const [transCurrency, setTransCurrency] = useState(CURRENCIES[0].code);
    const [isProcessing, setIsProcessing] = useState(false);
    const [memberBalances, setMemberBalances] = useState<Record<string, Record<string, { total: number, locations: Record<string, number> }>>>({});
    const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);

    // Transfer State
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [transferFrom, setTransferFrom] = useState(STORAGE_LOCATIONS[0]);
    const [transferTo, setTransferTo] = useState(STORAGE_LOCATIONS[1]);
    const [transferAmount, setTransferAmount] = useState("");
    const [transferCurrency, setTransferCurrency] = useState(CURRENCIES[0].code);

    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [historyItems, setHistoryItems] = useState<any[]>([]);
    const [selectedHistoryMember, setSelectedHistoryMember] = useState<any>(null);
    const [rates, setRates] = useState<Record<string, number>>({ 'TRY': 1, 'USD': 35.0, 'EUR': 38.0 });

    // Fetch live rates (same as Dashboard for consistency)
    useEffect(() => {
        const fetchRates = async () => {
            try {
                const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
                if (response.ok) {
                    const data = await response.json();
                    if (data && data.rates && data.rates.TRY) {
                        const tryBase = data.rates.TRY;
                        setRates({
                            'TRY': 1,
                            'USD': tryBase,
                            'EUR': tryBase / data.rates.EUR
                        });
                    }
                }
            } catch (err) {
                console.error("Rate fetch error:", err);
            }
        };
        fetchRates();
        const interval = setInterval(fetchRates, 30 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!activeUser) return;

        // Listen to user document for familyId
        const userRef = doc(db, "users", activeUser.uid);
        const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setFamilyId(data.familyId || null);
                const isOwner = activeUser.email === 'meoncu@gmail.com';
                setMyRole(isOwner ? 'admin' : (data.role || 'member'));
            } else {
                setLoading(false);
            }
        }, (err) => console.error("Family User check error:", err));

        // Fetch balances for everyone in the family (only for admins)
        // Actually, let's fetch for all users to show them their own and others' status if useful.
        // We filter by member IDs once members are loaded.
        return () => unsubscribeUser();
    }, [activeUser]);

    // Fetch Balances
    useEffect(() => {
        if (!familyId || !user) return;

        // Fetch all PAID expenses for the current family members to calculate individual balances
        // We query by user IDs of the members to ensure we catch all transactions (including legacy ones)
        if (members.length === 0) return;
        const memberIds = members.map(m => m.id);

        // Firestore 'in' query is limited to 10 items, but for family this is usually fine.
        const qExps = query(
            collection(db, "expenses"),
            where("userId", "in", memberIds),
            where("status", "==", "paid")
        );
        const unsubscribeBalances = onSnapshot(qExps, (snapshot) => {
            const balances: Record<string, Record<string, { total: number, locations: Record<string, number> }>> = {};
            snapshot.forEach((doc) => {
                const data = doc.data();
                const uid = data.userId;
                const loc = data.location || 'Bilinmiyor';
                const currency = data.currency || 'TRY';

                if (!balances[uid]) balances[uid] = {};
                if (!balances[uid][currency]) balances[uid][currency] = { total: 0, locations: {} };
                if (!balances[uid][currency].locations[loc]) balances[uid][currency].locations[loc] = 0;

                const amount = data.amount || 0;
                if (data.type === 'income') {
                    balances[uid][currency].total += amount;
                    balances[uid][currency].locations[loc] += amount;
                } else {
                    balances[uid][currency].total -= amount;
                    balances[uid][currency].locations[loc] -= amount;
                }
            });
            setMemberBalances(balances);
        }, (err) => console.error("Balances error:", err));

        return () => unsubscribeBalances();
    }, [familyId, user, members]);

    useEffect(() => {
        if (!familyId) {
            setMembers([]);
            if (user) setLoading(false);
            return;
        }

        // Fetch all users with the same familyId
        const q = query(collection(db, "users"), where("familyId", "==", familyId));
        const unsubscribeMembers = onSnapshot(q, (snapshot) => {
            const m: any[] = [];
            snapshot.forEach(doc => m.push({ id: doc.id, ...doc.data() }));
            setMembers(m);
            setLoading(false);
        }, (err) => console.error("Members list error:", err));

        return () => unsubscribeMembers();
    }, [familyId]);

    // History Listener
    useEffect(() => {
        if (!showHistoryModal || !selectedHistoryMember) return;

        const qHistory = query(
            collection(db, "expenses"),
            where("userId", "==", selectedHistoryMember.id),
            limit(50)
        );

        const unsubscribeHistory = onSnapshot(qHistory, (snapshot) => {
            const items: any[] = [];
            snapshot.forEach(doc => items.push({ id: doc.id, ...doc.data() }));
            // Sort in memory by date (desc)
            items.sort((a, b) => {
                const dateA = a.date?.seconds || 0;
                const dateB = b.date?.seconds || 0;
                return dateB - dateA;
            });
            setHistoryItems(items);
        }, (error) => {
            console.error("Member history error:", error);
        });

        return () => unsubscribeHistory();
    }, [showHistoryModal, selectedHistoryMember]);

    const handleCreateFamily = async () => {
        if (!user) return;
        const newFamilyId = `FAM-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        try {
            await setDoc(doc(db, "users", user.uid), {
                familyId: newFamilyId,
                email: user.email,
                displayName: user.displayName,
                role: 'admin', // Creator is Admin
                isApproved: true // Creator is auto-approved
            }, { merge: true });
        } catch (error) {
            console.error(error);
        }
    };

    const handleJoinFamily = async () => {
        if (!user || !inviteId.trim()) return;
        try {
            await setDoc(doc(db, "users", user.uid), {
                familyId: inviteId.trim().toUpperCase(),
                email: user.email,
                displayName: user.displayName,
                role: 'member', // Joiner is Member by default
                isApproved: false // Requires approval
            }, { merge: true });
            setInviteId("");
        } catch (error) {
            alert("Aileye katılırken hata oluştu. Kimlik kodunu kontrol edin.");
        }
    };

    const copyToClipboard = () => {
        if (familyId) {
            navigator.clipboard.writeText(familyId);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleAddChildTransaction = async () => {
        if (!user || !selectedMember || !transAmount || !transName) return;
        setIsProcessing(true);

        try {
            const amountVal = parseFloat(transAmount);
            const transData: any = {
                name: transName,
                amount: amountVal,
                type: transType,
                status: 'paid',
                userId: selectedMember.id,
                addedBy: user.uid,
                familyId: familyId,
                categoryName: transType === 'income' ? 'Harçlık' : 'Çocuk Gideri',
                categoryId: 'child-wallet',
                note: transNote,
                location: transLocation,
                currency: transCurrency
            };

            if (editingTransactionId) {
                await updateDoc(doc(db, "expenses", editingTransactionId), transData);
            } else {
                transData.date = Timestamp.now();
                await addDoc(collection(db, "expenses"), transData);
            }

            setShowTransactionModal(false);
            if (editingTransactionId) {
                setShowHistoryModal(true);
            }
            setEditingTransactionId(null);
            setTransAmount("");
            setTransName("");
            setTransNote("");
        } catch (err) {
            console.error(err);
            alert("İşlem kaydedilemedi.");
        } finally {
            setIsProcessing(false);
        }
    };

    const startEditingTransaction = (item: any) => {
        setEditingTransactionId(item.id);
        setTransType(item.type);
        setTransAmount(item.amount.toString());
        setTransName(item.name);
        setTransNote(item.note || "");
        setTransLocation(item.location || STORAGE_LOCATIONS[0]);
        setTransCurrency(item.currency || 'TRY');
        setShowTransactionModal(true);
        setShowHistoryModal(false);
    };

    const handleApproveMember = async (targetUid: string) => {
        try {
            await updateDoc(doc(db, "users", targetUid), {
                isApproved: true
            });
        } catch (error) {
            console.error(error);
        }
    };

    const toggleRole = async (targetUserId: string, currentRole: string) => {
        const newRole = currentRole === 'admin' ? 'member' : 'admin';
        if (!confirm(`Kullanıcı yetkisini ${newRole === 'admin' ? 'Yönetici' : 'Üye'} olarak değiştirmek istiyor musunuz?`)) return;
        try {
            await updateDoc(doc(db, "users", targetUserId), { role: newRole });
        } catch (err) {
            console.error(err);
        }
    };

    const handleLeaveFamily = async () => {
        if (!user || !confirm("Aile grubundan ayrılmak istediğinize emin misiniz? Ortak harcamaları göremeyeceksiniz.")) return;
        try {
            await updateDoc(doc(db, "users", user.uid), {
                familyId: null
            });
        } catch (error) {
            console.error(error);
        }
    };

    const viewMemberHistory = (member: any) => {
        setSelectedHistoryMember(member);
        setShowHistoryModal(true);
        setHistoryItems([]);
    };

    const handleDeleteTransaction = async (id: string) => {
        if (!confirm("Bu işlemi silmek istediğinize emin misiniz?")) return;
        try {
            // Optimistic update for immediate feedback
            setHistoryItems(prev => prev.filter(item => item.id !== id));
            await deleteDoc(doc(db, "expenses", id));
        } catch (err) {
            console.error(err);
            alert("İşlem silinemedi.");
        }
    };

    const handleImpersonate = (member: any) => {
        setImpersonatedUser({
            uid: member.id,
            email: member.email,
            displayName: member.displayName,
            role: member.role || 'member'
        });
        navigate('/');
    };

    const handleTransfer = async () => {
        if (!user || !selectedMember || !transferAmount || transferFrom === transferTo) return;
        setIsProcessing(true);
        const amount = parseFloat(transferAmount);

        try {
            const batch = writeBatch(db);

            // Transfer OUT from Source
            const outRef = doc(collection(db, "expenses"));
            batch.set(outRef, {
                name: `${transferFrom} -> ${transferTo} Transfer`,
                amount: amount,
                type: 'expense',
                status: 'paid',
                userId: selectedMember.id,
                addedBy: user.uid,
                familyId: familyId,
                date: Timestamp.now(),
                categoryName: 'Transfer',
                categoryId: 'child-wallet',
                location: transferFrom,
                currency: transferCurrency,
                note: `Fiziki para yer değişimi (${transferFrom} lokasyonundan çıkış)`
            });

            // Transfer IN to Target
            const inRef = doc(collection(db, "expenses"));
            batch.set(inRef, {
                name: `${transferFrom} -> ${transferTo} Transfer`,
                amount: amount,
                type: 'income',
                status: 'paid',
                userId: selectedMember.id,
                addedBy: user.uid,
                familyId: familyId,
                date: Timestamp.now(),
                categoryName: 'Transfer',
                categoryId: 'child-wallet',
                location: transferTo,
                currency: transferCurrency,
                note: `Fiziki para yer değişimi (${transferTo} lokasyonuna giriş)`
            });

            await batch.commit();
            setShowTransferModal(false);
            setTransferAmount("");
        } catch (err) {
            console.error(err);
            alert("Transfer başarısız.");
        } finally {
            setIsProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background pb-24 animate-fade-in font-sans">
            {/* Header */}
            <div className="p-6 pt-8 flex items-center justify-between border-b border-border/40 bg-card/30 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="-ml-2">
                        <ChevronLeft className="h-6 w-6" />
                    </Button>
                    <h1 className="text-xl font-bold">Ailem</h1>
                </div>
            </div>

            <div className="p-6 space-y-6">
                {!familyId ? (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <Card className="border-dashed border-2">
                            <CardContent className="pt-8 pb-8 text-center space-y-4">
                                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
                                    <Users size={32} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold">Henüz bir aileni yok</h2>
                                    <p className="text-sm text-muted-foreground px-4">Ortak giderlerinizi yönetmek için bir aile grubu kurun veya mevcut bir gruba katılın.</p>
                                </div>
                                <div className="pt-4 flex flex-col gap-3">
                                    <Button onClick={handleCreateFamily} className="w-full h-12 text-base font-semibold">Yeni Aile Grubu Kur</Button>
                                    <div className="relative">
                                        <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                                        <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">Veya</span></div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="Aile Kimlik Kodu (örn: FAM-123)"
                                            value={inviteId}
                                            onChange={(e) => setInviteId(e.target.value)}
                                            className="h-12"
                                        />
                                        <Button onClick={handleJoinFamily} variant="secondary" className="h-12 px-6">Katıl</Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <div className="bg-muted/30 p-4 rounded-2xl flex gap-4 items-start border border-border/40">
                            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-600 mt-1">
                                <Info size={18} />
                            </div>
                            <div className="text-sm space-y-1">
                                <p className="font-bold">Nasıl Çalışır?</p>
                                <p className="text-muted-foreground">Aile grubuna katıldığınızda, aile üyeleri tarafından oluşturulan "Paylaşımlı Gruplar" otomatik olarak ekranınıza gelir.</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Family Info */}
                        {myRole === 'admin' && (
                            <Card className="bg-primary text-primary-foreground border-none overflow-hidden relative">
                                <div className="absolute -right-8 -bottom-8 opacity-10">
                                    <Shield size={160} />
                                </div>
                                <CardContent className="pt-6 pb-6 space-y-4 relative z-10">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-xs uppercase font-bold tracking-widest text-primary-foreground/70 mb-1">Aile Grubu Kimliği</p>
                                            <h2 className="text-2xl font-black">{familyId}</h2>
                                        </div>
                                        <Button
                                            variant="secondary"
                                            size="icon"
                                            onClick={copyToClipboard}
                                            className="rounded-full bg-white/20 hover:bg-white/30 border-none text-white"
                                        >
                                            {copied ? <Check size={18} /> : <Copy size={18} />}
                                        </Button>
                                    </div>
                                    <p className="text-xs text-primary-foreground/80 leading-relaxed">
                                        Bu kodu ailenizle paylaşarak onları bu gruba davet edebilirsiniz.
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                        {myRole !== 'admin' && (
                            <Card className="bg-primary text-primary-foreground border-none overflow-hidden relative">
                                <CardContent className="pt-6 pb-6 text-center">
                                    <h2 className="text-xl font-black tracking-tight">{familyId} Ailesi</h2>
                                    <p className="text-xs text-primary-foreground/70 mt-1">Aile grubuna dahil edildiniz</p>
                                </CardContent>
                            </Card>
                        )}

                        {/* Members List */}
                        <div className="space-y-3">
                            <h3 className="text-sm uppercase font-bold text-muted-foreground flex items-center gap-2 px-1">
                                <Users size={16} /> Üyeler ({members.length})
                            </h3>
                            <div className="space-y-2">
                                {members.filter(m => {
                                    if (myRole === 'admin') return true;
                                    return m.id === user?.uid;
                                }).sort((a, b) => {
                                    if (a.id === user?.uid) return -1;
                                    if (b.id === user?.uid) return 1;
                                    return 0;
                                }).map((m) => (
                                    <div key={m.id} className="p-4 bg-card border border-border/50 rounded-2xl space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "w-10 h-10 rounded-full flex items-center justify-center font-bold",
                                                    m.role === 'admin' ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
                                                )}>
                                                    {m.displayName?.[0] || m.email?.[0]?.toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-sm">{m.displayName || m.email}</p>
                                                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                        {m.role === 'admin' ? <Shield size={10} className="text-primary" /> : <Users size={10} />}
                                                        {m.role === 'admin' ? 'Yönetici' : 'Aile Üyesi'}
                                                        {m.id === user?.uid && ' (Siz)'}
                                                        {!m.isApproved && <span className="text-amber-600 font-bold ml-1">• Onay Bekliyor</span>}
                                                    </p>
                                                </div>
                                            </div>

                                            <div
                                                className="text-right cursor-pointer hover:bg-muted/50 p-1 rounded-lg transition-colors group"
                                                onClick={() => viewMemberHistory(m)}
                                                title="Detaylar için tıklayın"
                                            >
                                                {!m.isApproved ? (
                                                    <div className="flex flex-col items-end gap-1">
                                                        <p className="text-[10px] text-amber-600 font-black uppercase tracking-tighter">İstek</p>
                                                        {myRole === 'admin' && (
                                                            <Button
                                                                size="sm"
                                                                className="h-7 px-3 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold rounded-lg transition-all active:scale-95"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleApproveMember(m.id);
                                                                }}
                                                            >
                                                                ONAYLA
                                                            </Button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <>
                                                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight group-hover:text-primary transition-colors flex items-center justify-end gap-1 mb-1">
                                                            KUMBARALAR <Clock size={10} />
                                                        </p>
                                                        {memberBalances[m.id] ? (
                                                            <div className="space-y-1">
                                                                {/* Total TL Equivalent */}
                                                                {(() => {
                                                                    let totalTlEq = 0;
                                                                    Object.entries(memberBalances[m.id]).forEach(([curr, data]) => {
                                                                        const rate = rates[curr] || 1;
                                                                        totalTlEq += (data.total * rate);
                                                                    });
                                                                    return (
                                                                        <p className={cn(
                                                                            "text-lg font-black leading-none text-right mb-2",
                                                                            totalTlEq >= 0 ? "text-emerald-700" : "text-rose-700"
                                                                        )}>
                                                                            ₺{totalTlEq.toLocaleString('tr-TR')}
                                                                        </p>
                                                                    );
                                                                })()}

                                                                {/* Original Currency Breakdown */}
                                                                {Object.entries(memberBalances[m.id]).map(([curr, data]) => {
                                                                    const currencyInfo = CURRENCIES.find(c => c.code === curr);
                                                                    return (
                                                                        <div key={curr} className="mb-2 last:mb-0 opacity-80">
                                                                            <p className={cn(
                                                                                "text-[10px] font-bold leading-none text-right",
                                                                                data.total >= 0 ? "text-emerald-600" : "text-rose-600"
                                                                            )}>
                                                                                {currencyInfo?.symbol || curr}{data.total.toLocaleString('tr-TR')}
                                                                            </p>
                                                                            {data.locations && (
                                                                                <div className="flex flex-wrap justify-end gap-1 mt-1 max-w-[150px]">
                                                                                    {Object.entries(data.locations)
                                                                                        .filter(([_, amt]) => amt !== 0)
                                                                                        .map(([loc, amt]) => (
                                                                                            <span key={loc} className="text-[8px] bg-muted/50 px-1.5 py-0.5 rounded-md font-bold text-muted-foreground border border-border/30">
                                                                                                {loc}: {amt}{currencyInfo?.symbol || curr}
                                                                                            </span>
                                                                                        ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <p className="text-xs text-muted-foreground italic">Cüzdan boş</p>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Admin Controls for other members */}
                                        {myRole === 'admin' && m.id !== activeUser?.uid && m.isApproved && (
                                            <div className="flex gap-2 pt-2 border-t border-border/40">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="flex-1 h-9 rounded-xl text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 gap-2"
                                                    onClick={() => {
                                                        setSelectedMember(m);
                                                        setTransType('income');
                                                        setTransName("Harçlık");
                                                        setShowTransactionModal(true);
                                                    }}
                                                >
                                                    <Plus size={16} /> Harçlık
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="flex-1 h-9 rounded-xl text-rose-600 hover:bg-rose-50 hover:text-rose-700 gap-2"
                                                    onClick={() => {
                                                        setSelectedMember(m);
                                                        setTransType('expense');
                                                        setTransName("");
                                                        setShowTransactionModal(true);
                                                    }}
                                                >
                                                    <Minus size={16} /> Harcama
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-9 w-9 rounded-xl text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                                    onClick={() => {
                                                        setSelectedMember(m);
                                                        setShowTransferModal(true);
                                                    }}
                                                    title="Para Yerini Değiştir (Transfer)"
                                                >
                                                    <TrendingUp size={16} />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-9 w-9 rounded-xl text-muted-foreground"
                                                    onClick={() => toggleRole(m.id, m.role)}
                                                    title="Yetki Değiştir"
                                                >
                                                    <Shield size={16} />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-9 w-9 rounded-xl text-muted-foreground"
                                                    onClick={() => viewMemberHistory(m)}
                                                    title="İşlem Geçmişi"
                                                >
                                                    <Clock size={16} />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-9 w-9 rounded-xl text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                                    onClick={() => handleImpersonate(m)}
                                                    title="Bu Kullanıcıya Geç"
                                                >
                                                    <UserCircle size={18} />
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="pt-6 space-y-4">
                            <Button
                                variant="outline"
                                className="w-full border-destructive/20 text-destructive hover:bg-destructive/5 h-12"
                                onClick={handleLeaveFamily}
                            >
                                Aile Grubundan Ayrıl
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Quick Transaction Modal */}
            {showTransactionModal && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowTransactionModal(false)} />
                    <div className="relative w-full max-w-lg bg-card border-t sm:border border-border rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 pb-12 sm:pb-8 flex flex-col gap-6 animate-in slide-in-from-bottom-10 duration-300">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "p-3 rounded-2xl",
                                    transType === 'income' ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
                                )}>
                                    {transType === 'income' ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg">{editingTransactionId ? 'İşlemi Düzenle' : `${selectedMember?.displayName || 'Üye'} Paneli`}</h3>
                                    <p className="text-xs text-muted-foreground">{editingTransactionId ? 'Kayıtlı verileri güncelliyorsunuz' : `Kumbara ${transType === 'income' ? 'Artışı' : 'Azalışı'}`}</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => {
                                setShowTransactionModal(false);
                                if (editingTransactionId) {
                                    setShowHistoryModal(true);
                                    setEditingTransactionId(null);
                                }
                            }} className="rounded-full">
                                <X size={20} />
                            </Button>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">İşlem Adı</label>
                                <Input
                                    placeholder={transType === 'income' ? "Haftalık Harçlık" : "Kırtasiye Harcaması"}
                                    value={transName}
                                    onChange={(e) => setTransName(e.target.value)}
                                    className="h-12 text-base rounded-2xl"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Detay / Kaynak (Opsiyonel)</label>
                                <Input
                                    placeholder="Kimden veya nereden geldiği..."
                                    value={transNote}
                                    onChange={(e) => setTransNote(e.target.value)}
                                    className="h-12 text-base rounded-2xl"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Para Nerede? (Fiziki Depolama)</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {STORAGE_LOCATIONS.map((loc) => (
                                        <button
                                            key={loc}
                                            type="button"
                                            onClick={() => setTransLocation(loc)}
                                            className={cn(
                                                "p-2 rounded-xl text-[10px] font-bold border-2 transition-all",
                                                transLocation === loc ? "bg-primary/10 border-primary text-primary" : "bg-card border-border/50 text-muted-foreground hover:border-border"
                                            )}
                                        >
                                            {loc}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Para Birimi</label>
                                    <div className="flex gap-2">
                                        {CURRENCIES.map((curr) => (
                                            <button
                                                key={curr.code}
                                                type="button"
                                                onClick={() => setTransCurrency(curr.code)}
                                                className={cn(
                                                    "flex-1 p-2 rounded-xl text-xs font-bold border-2 transition-all",
                                                    transCurrency === curr.code ? "bg-primary/10 border-primary text-primary" : "bg-card border-border/50 text-muted-foreground hover:border-border"
                                                )}
                                                title={curr.label}
                                            >
                                                {curr.symbol}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">Tutar</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">
                                            {CURRENCIES.find(c => c.code === transCurrency)?.symbol}
                                        </span>
                                        <Input
                                            type="number"
                                            placeholder="0.00"
                                            value={transAmount}
                                            onChange={(e) => setTransAmount(e.target.value)}
                                            className="h-12 text-xl font-black pl-8 rounded-2xl"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <Button
                            className={cn(
                                "w-full h-14 text-base font-bold rounded-2xl shadow-lg",
                                transType === 'income' ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
                            )}
                            onClick={handleAddChildTransaction}
                            disabled={isProcessing || !transAmount || !transName}
                        >
                            {isProcessing ? <Loader2 className="animate-spin mr-2" /> : (editingTransactionId ? 'Güncelle' : (transType === 'income' ? 'Cüzdana Ekle' : 'Hesaptan Düş'))}
                        </Button>
                    </div>
                </div>
            )}

            {/* Bottom Nav */}
            <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-lg border-t border-border p-2 px-6 flex justify-between items-center z-50 pb-6 pt-3 shadow-lg-up">
                <NavItem icon={<Home size={22} />} label="Özet" onClick={() => navigate('/')} />
                <NavItem icon={<Folder size={22} />} label="Gruplar" onClick={() => navigate('/categories')} />
                <NavItem icon={<Users size={22} />} label="Aile" active onClick={() => navigate('/family')} />
                <NavItem icon={<PieChart size={22} />} label="Raporlar" onClick={() => navigate('/reports')} />
                <NavItem icon={<Settings size={22} />} label="Ayarlar" onClick={() => navigate('/profile')} />
            </div>
            {/* History Modal */}
            {showHistoryModal && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowHistoryModal(false)} />
                    <div className="relative w-full max-w-lg bg-card border-t sm:border border-border rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 pb-12 sm:pb-8 flex flex-col gap-6 animate-in slide-in-from-bottom-10 duration-300 max-h-[85vh]">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-3 bg-primary/10 rounded-2xl text-primary">
                                    <Clock size={24} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg">{selectedHistoryMember?.displayName || 'Üye'} Geçmişi</h3>
                                    <p className="text-xs text-muted-foreground">Son 20 işlem</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setShowHistoryModal(false)} className="rounded-full">
                                <X size={20} />
                            </Button>
                        </div>

                        <div className="overflow-y-auto space-y-3 pr-1">
                            {historyItems.length > 0 ? (
                                historyItems.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-2xl border border-border/40">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "w-10 h-10 rounded-xl flex items-center justify-center",
                                                item.type === 'income' ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600"
                                            )}>
                                                {item.type === 'income' ? <Plus size={18} /> : <Minus size={18} />}
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm tracking-tight">{item.name}</p>
                                                <p className="text-[10px] text-muted-foreground">
                                                    {item.date?.seconds ? format(new Date(item.date.seconds * 1000), "d MMMM yyyy, HH:mm", { locale: tr }) : 'Tarih yok'}
                                                    {item.note && <span className="block italic text-primary/70">"{item.note}"</span>}
                                                    {item.location && <span className="inline-block mt-1 text-[9px] font-bold bg-muted px-2 py-0.5 rounded-full text-foreground/70 tracking-wider uppercase">{item.location}</span>}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <div className="text-right">
                                                <p className={cn(
                                                    "font-black text-sm",
                                                    item.type === 'income' ? "text-emerald-600" : "text-rose-600"
                                                )}>
                                                    {item.type === 'income' ? '+' : '-'}{CURRENCIES.find(c => c.code === (item.currency || 'TRY'))?.symbol || '₺'}{item.amount?.toLocaleString('tr-TR')}
                                                </p>
                                                <p className="text-[10px] text-muted-foreground uppercase font-bold">{item.categoryName}</p>
                                            </div>
                                            {myRole === 'admin' && (
                                                <div className="flex flex-col">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-muted-foreground hover:text-primary rounded-full"
                                                        onClick={() => startEditingTransaction(item)}
                                                    >
                                                        <Edit2 size={14} />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-7 w-7 text-muted-foreground hover:text-destructive rounded-full"
                                                        onClick={() => handleDeleteTransaction(item.id)}
                                                    >
                                                        <Trash2 size={14} />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-12 text-muted-foreground italic">
                                    Henüz işlem kaydı bulunmuyor.
                                </div>
                            )}
                        </div>

                        <Button
                            variant="secondary"
                            className="w-full h-12 text-sm font-bold rounded-xl"
                            onClick={() => setShowHistoryModal(false)}
                        >
                            Kapat
                        </Button>
                    </div>
                </div>
            )}
            {/* Transfer Modal */}
            {showTransferModal && selectedMember && (
                <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowTransferModal(false)} />
                    <div className="relative w-full max-w-sm bg-card border-t sm:border border-border rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 pb-10 sm:pb-8 flex flex-col gap-5 animate-in slide-in-from-bottom-10 duration-300">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-500/10 rounded-xl text-amber-600">
                                    <TrendingUp size={24} />
                                </div>
                                <h2 className="text-xl font-black tracking-tight">{selectedMember.displayName}'ın Parası</h2>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => setShowTransferModal(false)} className="rounded-full">
                                <X size={20} />
                            </Button>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Para Birimi</label>
                                <div className="flex gap-2">
                                    {CURRENCIES.map((curr) => (
                                        <button
                                            key={curr.code}
                                            type="button"
                                            onClick={() => setTransferCurrency(curr.code)}
                                            className={cn(
                                                "flex-1 p-2 rounded-xl text-xs font-bold border border-border transition-all",
                                                transferCurrency === curr.code ? "bg-amber-100 border-amber-600 text-amber-700" : "bg-muted/30 text-muted-foreground"
                                            )}
                                        >
                                            {curr.symbol}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Tutar</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">
                                        {CURRENCIES.find(c => c.code === transferCurrency)?.symbol}
                                    </span>
                                    <Input
                                        type="number"
                                        placeholder="0.00"
                                        value={transferAmount}
                                        onChange={(e) => setTransferAmount(e.target.value)}
                                        className="h-12 pl-8 text-xl font-black rounded-xl"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Nereden Alınsın?</label>
                            <select
                                className="w-full h-12 bg-muted/30 border border-border rounded-xl px-4 text-sm font-bold"
                                value={transferFrom}
                                onChange={(e) => setTransferFrom(e.target.value)}
                            >
                                {STORAGE_LOCATIONS.map(loc => {
                                    const locBalance = memberBalances[selectedMember.id]?.[transferCurrency]?.locations[loc] || 0;
                                    return (
                                        <option key={loc} value={loc}>
                                            {loc} (Mevcut: {locBalance}{CURRENCIES.find(c => c.code === transferCurrency)?.symbol})
                                        </option>
                                    );
                                })}
                            </select>
                        </div>
                        <div className="flex justify-center -my-2 opacity-50"><TrendingDown className="rotate-180" size={20} /></div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Nereye Gitsin?</label>
                            <select
                                className="w-full h-12 bg-muted/30 border border-border rounded-xl px-4 text-sm font-bold"
                                value={transferTo}
                                onChange={(e) => setTransferTo(e.target.value)}
                            >
                                {STORAGE_LOCATIONS.map(loc => (
                                    <option key={loc} value={loc}>{loc}</option>
                                ))}
                            </select>
                        </div>

                        <Button
                            className="w-full h-14 bg-amber-600 hover:bg-amber-700 text-white font-black rounded-2xl shadow-lg gap-2"
                            onClick={handleTransfer}
                            disabled={isProcessing || !transferAmount || transferFrom === transferTo}
                        >
                            {isProcessing ? <Loader2 className="animate-spin" /> : <><TrendingUp size={20} /> Yerini Değiştir</>}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex flex-col items-center space-y-1 p-2 rounded-xl transition-all",
                active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
        >
            {icon}
            <span className="text-[10px] font-medium">{label}</span>
        </button>
    );
}
