import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    ChevronLeft, Trash2, Check, Edit2, AlertCircle,
    Search, LayoutPanelTop, Copy
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import {
    collection, query, where, onSnapshot, deleteDoc, doc,
    updateDoc, increment, Timestamp, getDocs
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, isBefore, startOfDay } from 'date-fns';
import { tr } from 'date-fns/locale';

interface Expense {
    id: string;
    categoryId: string;
    categoryName?: string;
    name: string;
    amount: number;
    currency?: string;
    date: any;
    dueDate?: any;
    status: 'paid' | 'unpaid';
    paidBy?: string;
    paidByEmail?: string;
    type: 'income' | 'expense';
    userId: string;
    installmentGroupId?: string;
}

const CURRENCIES = [
    { code: 'TRY', symbol: '₺', label: 'TL' },
    { code: 'USD', symbol: '$', label: 'Dolar' },
    { code: 'EUR', symbol: '€', label: 'Euro' }
];

export default function DebugPage() {
    const navigate = useNavigate();
    const { user, impersonatedUser, rates } = useAuthStore();
    const activeUser = impersonatedUser || user;
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [userRole, setUserRole] = useState<string | null>(null);

    // Edit State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [editAmount, setEditAmount] = useState("");
    const [editCurrency, setEditCurrency] = useState('TRY');
    const [editDate, setEditDate] = useState("");
    const [editCategoryId, setEditCategoryId] = useState("");
    const [categories, setCategories] = useState<any[]>([]);

    useEffect(() => {
        if (!activeUser) return;

        // Security check: Only admin can access
        const unsubUser = onSnapshot(doc(db, "users", activeUser.uid), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                const isOwner = activeUser.email === 'meoncu@gmail.com';
                const role = isOwner ? 'admin' : (data.role || 'member');
                setUserRole(role);
                if (role !== 'admin') {
                    navigate('/');
                }
            }
        });

        const q = query(
            collection(db, "expenses"),
            where("status", "==", "unpaid"),
            where("type", "==", "expense")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const exps: Expense[] = [];
            snapshot.forEach((doc) => {
                exps.push({ id: doc.id, ...doc.data() } as Expense);
            });
            // Sort by due date (overdue first)
            exps.sort((a, b) => {
                const dateA = a.dueDate?.seconds || 0;
                const dateB = b.dueDate?.seconds || 0;
                return dateA - dateB;
            });
            setExpenses(exps);
            setLoading(false);
        });

        const qCats = query(collection(db, "categories"), where("userId", "==", activeUser.uid));
        const unsubCats = onSnapshot(qCats, (snap) => {
            const c: any[] = [];
            snap.forEach(doc => c.push({ id: doc.id, ...doc.data() }));
            setCategories(c);
        });

        return () => {
            unsubUser();
            unsubscribe();
            unsubCats();
        };
    }, [activeUser, navigate]);

    const handlePay = async (exp: Expense) => {
        try {
            await updateDoc(doc(db, "expenses", exp.id), {
                status: 'paid',
                paidBy: activeUser?.uid,
                paidByEmail: activeUser?.displayName || activeUser?.email,
                date: Timestamp.now()
            });
        } catch (error) {
            console.error("Payment error:", error);
        }
    };

    const handleDelete = async (exp: Expense) => {
        if (!confirm("Bu faturayı kalıcı olarak silmek istediğinize emin misiniz?")) return;
        try {
            await deleteDoc(doc(db, "expenses", exp.id));
            // Update category total
            const catRef = doc(db, "categories", exp.categoryId);
            const rate = rates[exp.currency || 'TRY'] || 1;
            await updateDoc(catRef, {
                totalAmount: increment(-(exp.amount * rate))
            });
        } catch (error) {
            console.error("Delete error:", error);
        }
    };

    const handleDeleteAllInstallments = async (exp: Expense) => {
        let prefix = "";
        let queryConstraints: any[] = [where("userId", "==", activeUser?.uid)];

        if (exp.installmentGroupId) {
            queryConstraints.push(where("installmentGroupId", "==", exp.installmentGroupId));
            prefix = exp.name.split(' (')[0];
        } else {
            // Fallback for old data: match by name prefix
            const match = exp.name.match(/(.*) \(\d+\/\d+\)/);
            if (!match) return;
            prefix = match[1];
        }

        if (!confirm(`"${prefix}" faturasına ait TÜM taksitleri silmek istediğinize emin misiniz?`)) return;

        try {
            const q = query(collection(db, "expenses"), ...queryConstraints);
            const snap = await getDocs(q);

            let totalToDeduct = 0;
            const deletePromises: any[] = [];
            let matchCount = 0;

            snap.forEach(d => {
                const data = d.data();
                // If we don't have groupId, we filter manually by prefix
                if (exp.installmentGroupId || data.name.startsWith(prefix)) {
                    matchCount++;
                    const rate = rates[data.currency || 'TRY'] || 1;
                    totalToDeduct += ((data.amount || 0) * rate);
                    deletePromises.push(deleteDoc(doc(db, "expenses", d.id)));
                }
            });

            if (matchCount === 0) return;

            await Promise.all(deletePromises);

            // Update category total (all deleted installments are subtracted from the category they were in)
            const catRef = doc(db, "categories", exp.categoryId);
            await updateDoc(catRef, {
                totalAmount: increment(-totalToDeduct)
            });

            alert(`${matchCount} adet taksit başarıyla silindi.`);
        } catch (error) {
            console.error("Bulk delete error:", error);
            alert("Silme işlemi sırasında bir hata oluştu.");
        }
    };

    const handleUpdate = async (e: React.FormEvent, exp: Expense) => {
        e.preventDefault();
        const newAmount = parseFloat(editAmount.replace(/\D/g, ""));
        const oldRate = rates[exp.currency || 'TRY'] || 1;
        const newRate = rates[editCurrency] || 1;
        const newCat = categories.find(c => c.id === editCategoryId);

        try {
            await updateDoc(doc(db, "expenses", exp.id), {
                name: editName,
                amount: newAmount,
                currency: editCurrency,
                date: new Date(editDate),
                categoryId: editCategoryId,
                categoryName: newCat?.name || exp.categoryName
            });

            // Adjust totals for old and new categories
            if (exp.categoryId === editCategoryId) {
                // Same category, just diff the amount
                const diffInTry = (newAmount * newRate) - (exp.amount * oldRate);
                if (diffInTry !== 0) {
                    await updateDoc(doc(db, "categories", exp.categoryId), {
                        totalAmount: increment(diffInTry)
                    });
                }
            } else {
                // Different category
                // 1. Remove from old
                await updateDoc(doc(db, "categories", exp.categoryId), {
                    totalAmount: increment(-(exp.amount * oldRate))
                });
                // 2. Add to new
                await updateDoc(doc(db, "categories", editCategoryId), {
                    totalAmount: increment(newAmount * newRate)
                });
            }
            setEditingId(null);
        } catch (error) {
            console.error("Update error:", error);
        }
    };

    const startEditing = (exp: Expense) => {
        setEditingId(exp.id);
        setEditName(exp.name);
        setEditAmount(exp.amount.toString());
        setEditCurrency(exp.currency || 'TRY');
        setEditDate(exp.date?.seconds ? format(new Date(exp.date.seconds * 1000), 'yyyy-MM-dd') : "");
        setEditCategoryId(exp.categoryId);
    };

    const filteredExpenses = expenses.filter(e =>
        e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        e.categoryName?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (userRole !== 'admin') return null;

    return (
        <div className="min-h-screen bg-background pb-24 font-sans animate-fade-in">
            {/* Header */}
            <div className="p-6 pt-8 flex items-center justify-between border-b border-border/40 bg-card/30 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="-ml-2">
                        <ChevronLeft className="h-6 w-6" />
                    </Button>
                    <div>
                        <h1 className="text-xl font-bold">Debug Paneli</h1>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest text-emerald-600">Tüm Ödenmemiş Faturalar</p>
                    </div>
                </div>
                <div className="h-10 w-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-600">
                    <LayoutPanelTop size={20} />
                </div>
            </div>

            <div className="p-6 space-y-6">
                {/* Search & Filter */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Fatura veya grup adı ara..."
                        className="pl-10 bg-card border-border/50 rounded-2xl h-12"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* List */}
                <div className="space-y-4">
                    {loading ? (
                        <p className="text-center py-12 text-sm text-muted-foreground animate-pulse">Yükleniyor...</p>
                    ) : filteredExpenses.length > 0 ? (
                        filteredExpenses.map(exp => {
                            const isOverdue = exp.dueDate?.seconds && isBefore(new Date(exp.dueDate.seconds * 1000), startOfDay(new Date()));
                            const curr = CURRENCIES.find(c => c.code === (exp.currency || 'TRY'));

                            return (
                                <Card key={exp.id} className={cn(
                                    "border-border/50 overflow-hidden transition-all hover:shadow-md",
                                    isOverdue ? "border-rose-500/20 bg-rose-500/[0.02]" : "bg-card"
                                )}>
                                    <CardContent className="p-4">
                                        {editingId === exp.id ? (
                                            <form onSubmit={(e) => handleUpdate(e, exp)} className="space-y-3">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <Input
                                                        value={editName}
                                                        onChange={e => setEditName(e.target.value)}
                                                        className="h-9 font-bold"
                                                        placeholder="Fatura Adı"
                                                    />
                                                    <select
                                                        value={editCategoryId}
                                                        onChange={(e) => setEditCategoryId(e.target.value)}
                                                        className="h-9 w-full bg-muted border border-border/50 rounded-lg text-xs font-bold px-2 outline-none"
                                                    >
                                                        {categories.map(c => (
                                                            <option key={c.id} value={c.id}>{c.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="flex gap-2">
                                                    <select
                                                        value={editCurrency}
                                                        onChange={(e) => setEditCurrency(e.target.value)}
                                                        className="bg-muted px-2 rounded-lg text-xs font-bold"
                                                    >
                                                        {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.symbol}</option>)}
                                                    </select>
                                                    <Input
                                                        value={editAmount}
                                                        onChange={e => setEditAmount(e.target.value.replace(/\D/g, ""))}
                                                        className="h-9 flex-1"
                                                    />
                                                    <Input
                                                        type="date"
                                                        value={editDate}
                                                        onChange={e => setEditDate(e.target.value)}
                                                        className="h-9 w-[130px] text-xs"
                                                    />
                                                </div>
                                                <div className="flex gap-2 pt-2">
                                                    <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => setEditingId(null)}>İPTAL</Button>
                                                    <Button type="submit" size="sm" className="flex-1">KAYDET</Button>
                                                </div>
                                            </form>
                                        ) : (
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className={cn(
                                                        "h-12 w-12 rounded-2xl flex items-center justify-center font-bold text-[10px] text-center leading-tight px-1 shadow-sm",
                                                        isOverdue ? "bg-rose-500 text-white" : "bg-primary/10 text-primary"
                                                    )}>
                                                        {exp.categoryName || 'GRUP'}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <p className="font-bold text-sm tracking-tight">{exp.name}</p>
                                                            {isOverdue && <AlertCircle size={14} className="text-rose-500" />}
                                                        </div>
                                                        <div className="flex flex-col gap-0.5 mt-0.5">
                                                            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                                                                {exp.dueDate?.seconds ? format(new Date(exp.dueDate.seconds * 1000), "d MMMM yyyy", { locale: tr }) : "-"}
                                                            </p>
                                                            {isOverdue && <p className="text-[9px] text-rose-600 font-bold uppercase">Gecikmiş Ödeme</p>}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-2">
                                                    <span className="font-black text-sm tabular-nums text-foreground">
                                                        {curr?.symbol}{exp.amount?.toLocaleString('tr-TR')}
                                                    </span>
                                                    <div className="flex gap-1">
                                                        {(exp.installmentGroupId || exp.name.includes('/')) && (
                                                            <Button
                                                                size="icon"
                                                                variant="ghost"
                                                                className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                                                onClick={() => handleDeleteAllInstallments(exp)}
                                                                title="Tüm Taksitleri Sil"
                                                            >
                                                                <Copy size={16} />
                                                            </Button>
                                                        )}
                                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => startEditing(exp)}>
                                                            <Edit2 size={16} />
                                                        </Button>
                                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-rose-500" onClick={() => handleDelete(exp)}>
                                                            <Trash2 size={16} />
                                                        </Button>
                                                        <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black rounded-lg ml-1 px-3" onClick={() => handlePay(exp)}>
                                                            ÖDE
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                        })
                    ) : (
                        <div className="text-center py-12 bg-muted/20 rounded-3xl border border-dashed border-border/50">
                            <Check className="w-12 h-12 mx-auto mb-3 text-emerald-500 opacity-30" />
                            <p className="text-sm text-muted-foreground font-medium italic">Tüm faturalar ödendi. Harikasınız!</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
