import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import { collection, query, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Users, UserPlus, ShieldCheck, X, ChevronLeft, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function AdminPanel() {
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [pendingUsers, setPendingUsers] = useState<any[]>([]);
    const [allUsers, setAllUsers] = useState<any[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);

    // Security check: Only allow meoncu@gmail.com
    useEffect(() => {
        if (user && user.email !== 'meoncu@gmail.com') {
            navigate('/');
        }
    }, [user, navigate]);

    useEffect(() => {
        const q = query(collection(db, "users"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const users: any[] = [];
            snapshot.forEach(docSnap => {
                users.push({ id: docSnap.id, ...docSnap.data() });
            });
            setAllUsers(users);
            setPendingUsers(users.filter(u => u.isApproved !== true && u.email !== 'meoncu@gmail.com'));
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handleApprove = async (userId: string) => {
        try {
            await updateDoc(doc(db, "users", userId), {
                isApproved: true,
                role: 'admin' // Make them family admin by default so they can manage their family
            });
        } catch (err) {
            console.error("Approve error:", err);
        }
    };

    const handleReject = async (userId: string) => {
        if (!confirm("Bu kullanıcıyı silmek istediğinize emin misiniz?")) return;
        try {
            await deleteDoc(doc(db, "users", userId));
        } catch (err) {
            console.error("Reject error:", err);
        }
    };

    const filteredUsers = allUsers.filter(u =>
        u.email?.toLowerCase().includes(search.toLowerCase()) ||
        u.displayName?.toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return <div className="p-8 text-center">Yükleniyor...</div>;

    return (
        <div className="min-h-screen bg-background p-6 pb-24">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
                    <ChevronLeft size={24} />
                </Button>
                <div>
                    <h1 className="text-2xl font-black tracking-tight">Yönetim Paneli</h1>
                    <p className="text-muted-foreground text-xs uppercase font-bold tracking-widest">Sistem Kontrolü</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 mb-8">
                <Card className="bg-primary text-primary-foreground border-none shadow-lg">
                    <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                        <Users size={24} className="mb-2 opacity-60" />
                        <div className="text-2xl font-black">{allUsers.length}</div>
                        <div className="text-[10px] font-bold uppercase opacity-60">Toplam Kullanıcı</div>
                    </CardContent>
                </Card>
                <Card className="bg-amber-500 text-white border-none shadow-lg">
                    <CardContent className="p-4 flex flex-col items-center justify-center text-center">
                        <UserPlus size={24} className="mb-2 opacity-60" />
                        <div className="text-2xl font-black">{pendingUsers.length}</div>
                        <div className="text-[10px] font-bold uppercase opacity-60">Bekleyen İstek</div>
                    </CardContent>
                </Card>
            </div>

            {/* Pending Approvals */}
            {pendingUsers.length > 0 && (
                <section className="mb-10">
                    <div className="flex items-center gap-2 mb-4 text-amber-600">
                        <ShieldCheck size={18} />
                        <h3 className="text-xs uppercase font-black tracking-widest">Onay Bekleyenler</h3>
                    </div>
                    <div className="space-y-3">
                        {pendingUsers.map(u => (
                            <Card key={u.id} className="border-amber-200 bg-amber-50/50">
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center font-bold text-amber-700">
                                            {u.displayName?.[0] || 'U'}
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm leading-tight">{u.displayName || 'İsimsiz'}</p>
                                            <p className="text-[10px] text-muted-foreground">{u.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <Button size="icon" variant="ghost" className="h-9 w-9 text-rose-500" onClick={() => handleReject(u.id)}>
                                            <X size={20} />
                                        </Button>
                                        <Button className="h-9 bg-emerald-600 font-bold px-4" onClick={() => handleApprove(u.id)}>
                                            ONAYLA
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </section>
            )}

            {/* All Users List */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs uppercase font-black tracking-widest text-muted-foreground">Kullanıcı Listesi</h3>
                    <div className="relative max-w-[150px]">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" size={12} />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Ara..."
                            className="h-8 pl-8 text-xs rounded-full bg-muted/50 border-none"
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    {filteredUsers.map(u => (
                        <div key={u.id} className="flex items-center justify-between p-3 rounded-xl bg-card border border-border/50">
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold ${u.isApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                    {u.displayName?.[0] || 'U'}
                                </div>
                                <div>
                                    <p className="text-sm font-bold leading-none">{u.displayName}</p>
                                    <p className="text-[10px] text-muted-foreground">{u.email}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${u.isApproved ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                                    {u.isApproved ? 'Aktif' : 'Beklemede'}
                                </span>
                                {u.role === 'admin' && (
                                    <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600">
                                        Admin
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
