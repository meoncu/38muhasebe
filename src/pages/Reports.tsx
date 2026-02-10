import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    ChevronLeft, Home, Folder, Users, PieChart, Settings,
    TrendingUp, TrendingDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
    PieChart as RePieChart, Pie, Cell, ResponsiveContainer,
    Tooltip
} from 'recharts';

export default function Reports() {
    const navigate = useNavigate();
    const { user, impersonatedUser, rates } = useAuthStore();
    const activeUser = impersonatedUser || user;
    const [expenses, setExpenses] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);

    useEffect(() => {
        if (!activeUser) return;

        // Fetch all categories for reference
        const qCats = query(collection(db, "categories"), where("userId", "==", activeUser.uid));
        const unsubscribeCats = onSnapshot(qCats, (snap) => {
            const c: any[] = [];
            snap.forEach(doc => c.push({ id: doc.id, ...doc.data() }));
            setCategories(c);
        });

        const qExps = query(
            collection(db, "expenses"),
            where("userId", "==", activeUser.uid)
        );

        const unsubscribeExps = onSnapshot(qExps, (snap) => {
            const e: any[] = [];
            snap.forEach(doc => e.push({ id: doc.id, ...doc.data() }));
            setExpenses(e);
        });

        return () => {
            unsubscribeCats();
            unsubscribeExps();
        };
    }, [activeUser, rates]);

    // Calculate Stats with currency conversion
    const totalIncome = expenses
        .filter(e => e.type === 'income' && e.status === 'paid')
        .reduce((sum, e) => {
            const rate = rates[e.currency || 'TRY'] || 1;
            return sum + (e.amount || 0) * rate;
        }, 0);

    const totalExpense = expenses
        .filter(e => e.type === 'expense' && e.status === 'paid')
        .reduce((sum, e) => {
            const rate = rates[e.currency || 'TRY'] || 1;
            return sum + (e.amount || 0) * rate;
        }, 0);

    // Prepare Pie Chart Data with currency conversion
    const categoryData = categories
        .filter(c => c.type === 'expense')
        .map(cat => {
            const amount = expenses
                .filter(e => e.categoryId === cat.id && e.status === 'paid')
                .reduce((sum, e) => {
                    const rate = rates[e.currency || 'TRY'] || 1;
                    return sum + (e.amount || 0) * rate;
                }, 0);
            return {
                name: cat.name,
                value: amount,
                color: cat.color ? cat.color.replace('bg-', '') : 'blue-500' // Simple mapping
            };
        })
        .filter(d => d.value > 0);

    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#64748b'];

    return (
        <div className="min-h-screen bg-background pb-24 animate-fade-in font-sans">
            {/* Header */}
            <div className="p-6 pt-8 flex items-center justify-between border-b border-border/40 bg-card/30 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="-ml-2">
                        <ChevronLeft className="h-6 w-6" />
                    </Button>
                    <h1 className="text-xl font-bold">Raporlar</h1>
                </div>
            </div>

            <div className="p-6 space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 gap-4">
                    <Card className="bg-emerald-500/5 border-emerald-500/20">
                        <CardContent className="pt-4 p-4">
                            <div className="flex items-center gap-2 mb-2 text-emerald-600">
                                <TrendingUp size={16} />
                                <span className="text-[10px] uppercase font-bold tracking-wider">Gelir</span>
                            </div>
                            <div className="text-lg font-bold text-emerald-700">₺{totalIncome.toLocaleString('tr-TR')}</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-rose-500/5 border-rose-500/20">
                        <CardContent className="pt-4 p-4">
                            <div className="flex items-center gap-2 mb-2 text-rose-600">
                                <TrendingDown size={16} />
                                <span className="text-[10px] uppercase font-bold tracking-wider">Gider</span>
                            </div>
                            <div className="text-lg font-bold text-rose-700">₺{totalExpense.toLocaleString('tr-TR')}</div>
                        </CardContent>
                    </Card>
                </div>

                {/* Categories Pie Chart */}
                <Card className="border-border/50 shadow-sm overflow-hidden">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <PieChart className="text-primary h-4 w-4" /> Gider Dağılımı
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="h-[250px] pt-0">
                        {categoryData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <RePieChart>
                                    <Pie
                                        data={categoryData}
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {categoryData.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value: any) => `₺${value?.toLocaleString('tr-TR')}`}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    />
                                </RePieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground italic text-xs">
                                <PieChart className="h-8 w-8 mb-2 opacity-20" />
                                Henüz veri bulunmuyor.
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Category Details List */}
                <div className="space-y-3">
                    <h3 className="text-xs uppercase font-bold text-muted-foreground tracking-widest px-1">Detaylar</h3>
                    {categoryData.map((item, index) => (
                        <div key={item.name} className="flex items-center justify-between p-4 bg-card border border-border/50 rounded-2xl">
                            <div className="flex items-center gap-3">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                                <span className="text-sm font-semibold text-foreground">{item.name}</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-sm font-bold">₺{item.value.toLocaleString('tr-TR')}</span>
                                <span className="text-[10px] text-muted-foreground font-medium">
                                    %{Math.round((item.value / (totalExpense || 1)) * 100)}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Bottom Nav */}
            <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-lg border-t border-border p-2 px-6 flex justify-between items-center z-50 pb-6 pt-3 shadow-lg-up">
                <NavItem icon={<Home size={22} />} label="Özet" onClick={() => navigate('/')} />
                <NavItem icon={<Folder size={22} />} label="Gruplar" onClick={() => navigate('/categories')} />
                <NavItem icon={<Users size={22} />} label="Aile" onClick={() => navigate('/family')} />
                <NavItem icon={<PieChart size={22} />} label="Raporlar" active />
                <NavItem icon={<Settings size={22} />} label="Ayarlar" onClick={() => navigate('/profile')} />
            </div>
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
