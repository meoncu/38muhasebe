import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { ShieldAlert, LogOut } from 'lucide-react';

export default function ImpersonationBanner() {
    const { impersonatedUser, setImpersonatedUser } = useAuthStore();

    if (!impersonatedUser) return null;

    return (
        <div className="bg-amber-500 text-white p-2 px-6 flex items-center justify-between sticky top-0 z-[100] shadow-md">
            <div className="flex items-center gap-3">
                <ShieldAlert size={20} className="animate-pulse" />
                <p className="text-sm font-bold">
                    Şu an <span className="underline">{impersonatedUser.displayName || impersonatedUser.email}</span> kullanıcısı olarak görüntülüyorsunuz.
                </p>
            </div>
            <Button
                variant="ghost"
                size="sm"
                className="h-8 bg-white/20 hover:bg-white/30 text-white hover:text-white border-none rounded-lg font-black text-[10px] uppercase tracking-wider gap-2 transition-all active:scale-95"
                onClick={() => setImpersonatedUser(null)}
            >
                <LogOut size={14} /> Yöneticiye Dön
            </Button>
        </div>
    );
}
