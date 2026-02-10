import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronLeft, TrendingUp, TrendingDown, Wallet, Calendar, ChevronRight, ChevronDown, Receipt, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

interface Transaction {
    id: string;
    name: string;
    amount: number;
    type: 'income' | 'expense';
    categoryName: string;
    categoryId: string;
    date: any;
    currency: string;
}

export default function CashFlowPage() {
    const navigate = useNavigate();
    const { user, impersonatedUser, rates } = useAuthStore();
    const activeUser = impersonatedUser || user;
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [expandedMonths, setExpandedMonths] = useState<string[]>([]);
    const [expandedCategories, setExpandedCategories] = useState<string[]>([]);

    useEffect(() => {
        if (!activeUser) return;

        const q = query(
            collection(db, "expenses"),
            where("userId", "==", activeUser.uid),
            where("status", "==", "paid")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const txs: Transaction[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                txs.push({ id: doc.id, ...data } as Transaction);
            });
            // Sort by date descending
            txs.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
            setTransactions(txs);
        });

        return () => unsubscribe();
    }, [activeUser]);

    const toggleMonth = (monthKey: string) => {
        setExpandedMonths(prev => prev.includes(monthKey) ? prev.filter(m => m !== monthKey) : [...prev, monthKey]);
    };

    const toggleCategory = (catKey: string) => {
        setExpandedCategories(prev => prev.includes(catKey) ? prev.filter(c => c !== catKey) : [...prev, catKey]);
    };

    // Calculate Monthly Breakdown
    const monthlyData = transactions.reduce((acc: any, tx) => {
        const date = tx.date?.seconds ? new Date(tx.date.seconds * 1000) : new Date();
        const monthKey = format(date, 'yyyy-MM');
        if (!acc[monthKey]) {
            acc[monthKey] = {
                label: format(date, 'MMMM yyyy', { locale: tr }),
                income: 0,
                expense: 0,
                categories: {}
            };
        }

        const rate = rates[tx.currency || 'TRY'] || 1;
        const amountInTry = tx.amount * rate;

        if (tx.type === 'income') acc[monthKey].income += amountInTry;
        else acc[monthKey].expense += amountInTry;

        const catName = tx.categoryName || 'Diğer';
        if (!acc[monthKey].categories[catName]) {
            acc[monthKey].categories[catName] = {
                name: catName,
                type: tx.type,
                total: 0,
                items: []
            };
        }
        acc[monthKey].categories[catName].total += amountInTry;
        acc[monthKey].categories[catName].items.push({ ...tx, amountInTry });

        return acc;
    }, {});

    const sortedMonths = Object.keys(monthlyData).sort().reverse();
    const totalBalance = transactions.reduce((sum, tx) => {
        const rate = rates[tx.currency || 'TRY'] || 1;
        return sum + (tx.type === 'income' ? tx.amount * rate : -(tx.amount * rate));
    }, 0);

    return (
        <div className="min-h-screen bg-background pb-24">
            {/* Header */}
            <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border p-4 flex items-center gap-4">
                <button onClick={() => navigate(-1)} className="p-2 hover:bg-muted rounded-full transition-colors">
                    <ChevronLeft size={24} />
                </button>
                <h1 className="text-xl font-black tracking-tight">Kasa Detayı</h1>
            </div>

            <div className="p-4 max-w-2xl mx-auto space-y-6">
                {/* Overall Summary Card */}
                <Card className="bg-slate-900 text-white border-none shadow-2xl overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:rotate-12 transition-transform">
                        <Wallet size={120} />
                    </div>
                    <CardContent className="p-6 relative z-10">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Genel Kasa Bakiyesi</p>
                        <div className="text-4xl font-black mb-4">
                            ₺{totalBalance.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3">
                                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider mb-1">Toplam Gelir</p>
                                <p className="font-black text-emerald-500 text-lg tabular-nums">
                                    ₺{transactions.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount * (rates[t.currency || 'TRY'] || 1)), 0).toLocaleString('tr-TR')}
                                </p>
                            </div>
                            <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-3">
                                <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wider mb-1">Toplam Gider</p>
                                <p className="font-black text-rose-500 text-lg tabular-nums">
                                    ₺{transactions.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount * (rates[t.currency || 'TRY'] || 1)), 0).toLocaleString('tr-TR')}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Monthly Breakdown */}
                <div className="space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground px-1">Aylık İcmal</h3>
                    {sortedMonths.map(monthKey => {
                        const data = monthlyData[monthKey];
                        const isExpanded = expandedMonths.includes(monthKey);
                        const net = data.income - data.expense;

                        return (
                            <div key={monthKey} className="bg-card border border-border rounded-3xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <button
                                    onClick={() => toggleMonth(monthKey)}
                                    className="w-full p-5 flex items-center justify-between hover:bg-muted/30 transition-colors"
                                >
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                            <Calendar size={24} />
                                        </div>
                                        <div className="text-left">
                                            <p className="font-black text-lg leading-none mb-1">{data.label}</p>
                                            <div className="flex items-center gap-3">
                                                <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                                                    <ArrowUpRight size={10} /> +{data.income.toLocaleString('tr-TR')}
                                                </span>
                                                <span className="text-[10px] font-bold text-rose-600 flex items-center gap-1">
                                                    <ArrowDownRight size={10} /> -{data.expense.toLocaleString('tr-TR')}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="text-right">
                                            <p className={cn("text-sm font-black", net >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                                {net >= 0 ? '+' : ''}{net.toLocaleString('tr-TR')}
                                            </p>
                                            <p className="text-[9px] font-bold text-muted-foreground uppercase opacity-70">NET FARK</p>
                                        </div>
                                        {isExpanded ? <ChevronDown size={20} className="text-muted-foreground" /> : <ChevronRight size={20} className="text-muted-foreground" />}
                                    </div>
                                </button>

                                {isExpanded && (
                                    <div className="px-5 pb-5 pt-0 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="h-px bg-border/50 mb-4" />
                                        {Object.values(data.categories).map((cat: any) => {
                                            const catKey = `${monthKey}-${cat.name}`;
                                            const isCatExpanded = expandedCategories.includes(catKey);
                                            return (
                                                <div key={catKey} className="space-y-2">
                                                    <button
                                                        onClick={() => toggleCategory(catKey)}
                                                        className="w-full flex items-center justify-between p-3 bg-muted/20 rounded-2xl hover:bg-muted/40 transition-all border border-transparent hover:border-border/50"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={cn(
                                                                "p-2 rounded-xl",
                                                                cat.type === 'income' ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                                                            )}>
                                                                {cat.type === 'income' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                                                            </div>
                                                            <span className="font-bold text-sm tracking-tight">{cat.name}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className={cn(
                                                                "font-black text-sm",
                                                                cat.type === 'income' ? "text-emerald-600" : "text-rose-600"
                                                            )}>
                                                                {cat.type === 'income' ? '+' : '-'}{cat.total.toLocaleString('tr-TR')}
                                                            </span>
                                                            {isCatExpanded ? <ChevronDown size={16} className="opacity-40" /> : <ChevronRight size={16} className="opacity-40" />}
                                                        </div>
                                                    </button>

                                                    {isCatExpanded && (
                                                        <div className="pl-4 space-y-1 animate-in fade-in slide-in-from-left-2 duration-200">
                                                            {cat.items.map((item: any) => (
                                                                <div key={item.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/10 transition-colors border-l-2 border-border ml-2">
                                                                    <div className="flex items-center gap-3">
                                                                        <Receipt size={14} className="text-muted-foreground" />
                                                                        <div>
                                                                            <p className="text-xs font-bold leading-none mb-1">{item.name}</p>
                                                                            <p className="text-[9px] text-muted-foreground uppercase">{format(new Date(item.date.seconds * 1000), 'd MMMM', { locale: tr })}</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <p className="text-xs font-black">
                                                                            {item.type === 'income' ? '+' : '-'}{item.amount.toLocaleString('tr-TR')} {item.currency || 'TRY'}
                                                                        </p>
                                                                        {item.currency && item.currency !== 'TRY' && (
                                                                            <p className="text-[9px] text-muted-foreground opacity-70">
                                                                                ≈ ₺{item.amountInTry.toLocaleString('tr-TR')}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
