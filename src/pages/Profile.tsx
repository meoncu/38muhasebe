import React, { useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { updateProfile, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { User, LogOut, ChevronLeft, Save, Loader2, Bell, Shield, Folder, ShieldCheck } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

export default function Profile() {
    const { user, impersonatedUser, rates, ratesLastUpdated } = useAuthStore();
    const activeUser = impersonatedUser || user;
    const navigate = useNavigate();
    const [name, setName] = useState(activeUser?.displayName || "");
    const [loading, setLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState("");
    const [userRole, setUserRole] = useState<string | null>(null);

    React.useEffect(() => {
        if (!activeUser) return;
        const unsub = onSnapshot(doc(db, "users", activeUser.uid), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                const isOwner = activeUser.email === 'meoncu@gmail.com';
                setUserRole(isOwner ? 'admin' : (data.role || 'member'));
            }
        });
        return () => unsub();
    }, [user]);

    const handleUpdateProfile = async () => {
        if (!user) return;
        setLoading(true);
        try {
            await updateProfile(user, {
                displayName: name,
            });
            setSuccessMessage("Profil başarıyla güncellendi!");
            setTimeout(() => setSuccessMessage(""), 3000);
        } catch (error) {
            console.error("Profil güncelleme hatası:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/login');
        } catch (error) {
            console.error("Çıkış hatası:", error);
        }
    };

    const getInitials = (name: string) => {
        return name
            ?.split(' ')
            .map((n) => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2) || '??';
    };

    return (
        <div className="min-h-screen bg-background text-foreground pb-24 font-sans animate-fade-in">
            {/* Header */}
            <div className="p-6 pt-8 flex items-center gap-4 border-b border-border/40 bg-card/30 backdrop-blur-md sticky top-0 z-10">
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="-ml-2">
                    <ChevronLeft className="h-6 w-6" />
                </Button>
                <h1 className="text-xl font-bold">Profil & Ayarlar</h1>
            </div>

            <div className="p-6 space-y-6">
                {/* Profile Card */}
                <div className="flex flex-col items-center justify-center space-y-4 py-6">
                    <div className="h-24 w-24 rounded-full bg-primary/10 text-primary flex items-center justify-center border-4 border-background shadow-xl ring-2 ring-primary/20 overflow-hidden relative group cursor-pointer">
                        {user?.photoURL ? (
                            <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-3xl font-bold">
                                {getInitials(user?.displayName || user?.email || 'U')}
                            </span>
                        )}
                    </div>
                    <div className="text-center">
                        <p className="text-sm text-muted-foreground">{activeUser?.email}</p>
                        <div className="flex items-center justify-center gap-2 mt-1">
                            {userRole === 'admin' ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-bold border border-emerald-500/20 flex items-center gap-1">
                                    <ShieldCheck size={10} /> YÖNETİCİ
                                </span>
                            ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 font-bold border border-blue-500/20 flex items-center gap-1">
                                    <User size={10} /> AİLE ÜYESİ
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Edit Form */}
                <section className="space-y-4">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider ml-1">Kişisel Bilgiler</h2>
                    <Card>
                        <CardContent className="p-4 space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium flex items-center gap-2">
                                    <User className="h-4 w-4 text-muted-foreground" /> Ad Soyad
                                </label>
                                <Input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="bg-muted/30"
                                    disabled={!!impersonatedUser}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {!impersonatedUser ? (
                        <Button
                            onClick={handleUpdateProfile}
                            disabled={loading}
                            className="w-full"
                        >
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Değişiklikleri Kaydet
                        </Button>
                    ) : (
                        <p className="text-xs text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200 text-center font-medium">
                            Başka bir kullanıcıyı görüntülerken profil bilgilerini değiştiremezsiniz.
                        </p>
                    )}
                    {successMessage && (
                        <p className="text-green-600 text-sm text-center font-medium animate-pulse">{successMessage}</p>
                    )}
                </section>

                {/* Menu Items */}
                <section className="space-y-4">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider ml-1">Uygulama Ayarları</h2>
                    <Card>
                        <CardContent className="p-0 divide-y divide-border/50">
                            <MenuItem icon={<Folder className="h-5 w-5" />} label="Fatura Gruplarım" onClick={() => navigate('/categories')} />
                            <MenuItem icon={<Bell className="h-5 w-5" />} label="Bildirim Ayarları" badge="2" />
                            <MenuItem icon={<Shield className="h-5 w-5" />} label="Gizlilik ve Güvenlik" />
                        </CardContent>
                    </Card>
                </section>

                {/* Currency Rates */}
                <section className="space-y-4">
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider ml-1">Güncel Döviz Kurları</h2>
                    <Card>
                        <CardContent className="p-4 space-y-3">
                            <div className="flex justify-between items-center bg-muted/20 p-3 rounded-lg border border-border/40">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-500/10 rounded-lg text-blue-600 font-bold text-xs">$ USD</div>
                                    <span className="font-bold text-lg tabular-nums">₺{rates['USD']?.toFixed(2)}</span>
                                </div>
                                <div className="w-px h-8 bg-border/50" />
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-600 font-bold text-xs">€ EUR</div>
                                    <span className="font-bold text-lg tabular-nums">₺{rates['EUR']?.toFixed(2)}</span>
                                </div>
                            </div>
                            {ratesLastUpdated && (
                                <p className="text-[10px] text-muted-foreground text-center italic">
                                    Son güncelleme: {format(new Date(ratesLastUpdated), "d MMMM yyyy HH:mm", { locale: tr })}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </section>

                <section>
                    <Button
                        variant="destructive"
                        className="w-full mt-4"
                        onClick={handleLogout}
                    >
                        <LogOut className="mr-2 h-4 w-4" />
                        Çıkış Yap
                    </Button>
                    <p className="text-center text-xs text-muted-foreground mt-6">
                        v1.0.0 • Modern Finans
                    </p>
                </section>
            </div>
        </div>
    );
}

function MenuItem({ icon, label, badge, onClick }: { icon: React.ReactNode, label: string, badge?: string, onClick?: () => void }) {
    return (
        <button onClick={onClick} className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left group">
            <div className="flex items-center gap-3 text-foreground/80 group-hover:text-primary transition-colors">
                <span className="text-muted-foreground group-hover:text-primary transition-colors">{icon}</span>
                <span className="font-medium">{label}</span>
            </div>
            <div className="flex items-center gap-2">
                {badge && (
                    <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                        {badge}
                    </span>
                )}
                <ChevronLeft className="h-4 w-4 text-muted-foreground rotate-180" />
            </div>
        </button>
    )
}
