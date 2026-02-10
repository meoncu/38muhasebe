import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldAlert, LogOut, Clock } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect } from 'react';

export default function PendingApproval() {
    const navigate = useNavigate();
    const { user } = useAuthStore();

    useEffect(() => {
        if (!user) return;

        const unsubscribe = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.isApproved) {
                    navigate('/'); // Redirect to dashboard if approved
                }
                if (!data.familyId) {
                    navigate('/family'); // Go back to join/create if no family
                }
            }
        });

        return () => unsubscribe();
    }, [user, navigate]);

    const handleLogout = async () => {
        await signOut(auth);
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6 animate-fade-in">
            <Card className="w-full max-w-md border-none shadow-2xl bg-card overflow-hidden">
                <div className="h-2 bg-amber-500" />
                <CardContent className="pt-10 pb-10 text-center space-y-6">
                    <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto text-amber-600 animate-pulse">
                        <Clock size={40} />
                    </div>

                    <div className="space-y-2">
                        <h2 className="text-2xl font-black tracking-tight">Onay Bekleniyor</h2>
                        <p className="text-muted-foreground text-sm px-4">
                            Giriş isteğiniz yöneticiye iletildi. Güvenlik gereği, yönetici onaylamadan sistemi kullanamazsınız.
                        </p>
                    </div>

                    <div className="bg-muted/50 p-4 rounded-2xl flex gap-4 items-start text-left border border-border/40">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            <ShieldAlert size={18} />
                        </div>
                        <div className="text-xs space-y-1">
                            <p className="font-bold">Neden Bekliyorum?</p>
                            <p className="text-muted-foreground italic">
                                Verilerinizin gizliliği için sadece aile yöneticisi tarafından onaylanan kişiler aile bilgilerine erişebilir.
                            </p>
                        </div>
                    </div>

                    <div className="pt-4 space-y-3">
                        <Button
                            variant="outline"
                            className="w-full h-12 rounded-xl flex gap-2"
                            onClick={() => window.location.reload()}
                        >
                            <Clock size={18} /> Durumu Kontrol Et
                        </Button>
                        <Button
                            variant="ghost"
                            className="w-full h-12 rounded-xl text-muted-foreground flex gap-2"
                            onClick={handleLogout}
                        >
                            <LogOut size={18} /> Oturumu Kapat
                        </Button>
                    </div>

                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
                        Modern Muhasebe &copy; 2024
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
