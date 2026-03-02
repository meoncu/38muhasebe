import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    ChevronLeft, Search, ArrowUpRight,
    ArrowDownLeft, Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { collection, query, where, onSnapshot, orderBy, limit, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';

interface Transaction {
    id: string;
    name: string;
    amount: number;
    currency: string;
    date: any;
    dueDate?: any;
    status: 'paid' | 'unpaid';
    type: 'income' | 'expense';
    categoryName: string;
    categoryId: string;
    isAutoPay?: boolean;
}

const CURRENCIES = [
    { code: 'TRY', symbol: '₺' },
    { code: 'USD', symbol: '$' },
    { code: 'EUR', symbol: '€' }
];

export default function SearchPage() {
    const navigate = useNavigate();
    const { user, impersonatedUser } = useAuthStore();
    const activeUser = impersonatedUser || user;

    const [searchTerm, setSearchTerm] = useState("");
    const [results, setResults] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(false);
    const [filterType, setFilterType] = useState<'all' | 'income' | 'expense'>('all');
    const [filterStatus, setFilterStatus] = useState<'all' | 'paid' | 'unpaid'>('all');
    const [categories, setCategories] = useState<any[]>([]);

    useEffect(() => {
        if (!activeUser) return;
        const qCat = query(collection(db, "categories"), where("userId", "==", activeUser.uid));
        return onSnapshot(qCat, (snap) => {
            const cats: any[] = [];
            snap.forEach(d => cats.push({ id: d.id, ...d.data() }));
            setCategories(cats);
        });
    }, [activeUser]);

    useEffect(() => {
        if (!activeUser) return;
        setLoading(true);

        const q = query(
            collection(db, "expenses"),
            where("userId", "==", activeUser.uid),
            orderBy("date", "desc"),
            limit(100)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data: Transaction[] = [];
            snapshot.forEach(doc => {
                data.push({ id: doc.id, ...doc.data() } as Transaction);
            });
            setResults(data);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [activeUser]);

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Bu işlemi kalıcı olarak silmek istediğinize emin misiniz?")) return;
        try {
            await deleteDoc(doc(db, "expenses", id));
        } catch (err) {
            console.error("Delete error:", err);
            alert("Silme işlemi başarısız.");
        }
    };

    const filteredResults = results.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.categoryName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesType = filterType === 'all' || item.type === filterType;
        const matchesStatus = filterStatus === 'all' || item.status === filterStatus;
        return matchesSearch && matchesType && matchesStatus;
    });

    return (
        <div className="min-h-screen bg-background pb-24 font-sans animate-fade-in">
            {/* Header */}
            <div className="p-6 pt-8 border-b border-border/40 bg-card/30 backdrop-blur-md sticky top-0 z-20">
                <div className="flex items-center gap-4 mb-6">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="-ml-2">
                        <ChevronLeft className="h-6 w-6" />
                    </Button>
                    <h1 className="text-xl font-bold">Detaylı Arama</h1>
                </div>

                <div className="space-y-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="İşlem adı, kategori veya not ara..."
                            className="pl-10 bg-card border-border/50 rounded-2xl h-12"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            autoFocus
                        />
                    </div>

                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                        <FilterButton
                            active={filterType === 'all'}
                            label="Hepsi"
                            onClick={() => setFilterType('all')}
                        />
                        <FilterButton
                            active={filterType === 'income'}
                            label="Gelirler"
                            icon={<ArrowUpRight size={12} className="text-emerald-500" />}
                            onClick={() => setFilterType('income')}
                        />
                        <FilterButton
                            active={filterType === 'expense'}
                            label="Giderler"
                            icon={<ArrowDownLeft size={12} className="text-rose-500" />}
                            onClick={() => setFilterType('expense')}
                        />
                        <div className="w-px h-8 bg-border/50 mx-1" />
                        <FilterButton
                            active={filterStatus === 'paid'}
                            label="Ödenenler"
                            onClick={() => setFilterStatus('paid')}
                        />
                        <FilterButton
                            active={filterStatus === 'unpaid'}
                            label="Bekleyenler"
                            onClick={() => setFilterStatus('unpaid')}
                        />
                    </div>
                </div>
            </div>

            <div className="p-6 space-y-4">
                {loading ? (
                    <div className="text-center py-20 animate-pulse text-muted-foreground uppercase text-[10px] font-black tracking-widest">
                        Veriler Getiriliyor...
                    </div>
                ) : filteredResults.length > 0 ? (
                    filteredResults.map(item => (
                        <Card key={item.id} className="border-border/50 overflow-hidden bg-card/50 hover:bg-card transition-colors cursor-pointer" onClick={() => navigate(`/categories?id=${item.categoryId}`)}>
                            <CardContent className="p-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className={cn(
                                            "h-10 w-10 rounded-xl flex items-center justify-center text-white shadow-sm",
                                            item.type === 'income' ? "bg-emerald-500" : "bg-rose-500"
                                        )}>
                                            {item.type === 'income' ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-sm tracking-tight">{item.name}</p>
                                                {item.isAutoPay && (
                                                    <span className="bg-emerald-100 text-emerald-600 text-[8px] font-black px-1.5 py-0.5 rounded uppercase">OTO</span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className={cn(
                                                    "text-[10px] font-bold uppercase tracking-wider",
                                                    categories.find(c => c.id === item.categoryId) ? "text-muted-foreground" : "text-rose-500 bg-rose-50 px-1 rounded"
                                                )}>
                                                    {item.categoryName}
                                                    {!categories.find(c => c.id === item.categoryId) && " (GRUP BULUNAMADI)"}
                                                </span>
                                                <span className="text-[10px] text-muted-foreground opacity-50">•</span>
                                                <span className="text-[10px] text-muted-foreground">{format(item.date?.seconds ? new Date(item.date.seconds * 1000) : new Date(), 'd MMMM yyyy', { locale: tr })}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="flex flex-col items-end gap-1">
                                            <span className={cn(
                                                "font-black text-sm tabular-nums",
                                                item.type === 'income' ? "text-emerald-600" : "text-foreground"
                                            )}>
                                                {item.type === 'income' ? '+' : '-'}
                                                {CURRENCIES.find(c => c.code === item.currency)?.symbol || '₺'}
                                                {item.amount.toLocaleString('tr-TR')}
                                            </span>
                                            <span className={cn(
                                                "text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter",
                                                item.status === 'paid' ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
                                            )}>
                                                {item.status === 'paid' ? 'ÖDENDİ' : 'BEKLEYOR'}
                                            </span>
                                        </div>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-rose-500 hover:bg-rose-50" onClick={(e) => handleDelete(item.id, e)}>
                                            <Trash2 size={16} />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))
                ) : (
                    <div className="text-center py-20 px-10">
                        <Search className="h-10 w-10 text-muted-foreground/20 mx-auto mb-4" />
                        <p className="text-sm text-muted-foreground font-medium italic">Aramanızla eşleşen bir sonuç bulunamadı.</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function FilterButton({ active, label, icon, onClick }: { active: boolean, label: string, icon?: React.ReactNode, onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all border",
                active
                    ? "bg-primary text-primary-foreground border-primary shadow-sm scale-105"
                    : "bg-card text-muted-foreground border-border hover:border-primary/30"
            )}
        >
            {icon}
            {label}
        </button>
    );
}
