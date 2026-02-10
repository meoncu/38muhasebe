import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ChevronLeft, Plus, Folder, ShoppingBag, Home, Truck, Wifi, Trash2, Check, Clock, Wallet, Banknote, TrendingUp, TrendingDown, Users, PieChart, Settings, Share2, Edit2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc, updateDoc, increment, or, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { tr } from 'date-fns/locale';

interface Category {
    id: string;
    name: string;
    color: string;
    icon: string;
    totalAmount: number;
    type: 'income' | 'expense';
    familyId?: string | null;
    createdBy?: string;
    userId?: string;
}

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
    type?: 'income' | 'expense';
}

const CURRENCIES = [
    { code: 'TRY', symbol: '₺', label: 'TL' },
    { code: 'USD', symbol: '$', label: 'Dolar' },
    { code: 'EUR', symbol: '€', label: 'Euro' }
];

const COLORS = [
    "bg-blue-500", "bg-green-500", "bg-orange-500", "bg-purple-500", "bg-red-500", "bg-pink-500", "bg-slate-500"
];

const ICONS = [
    { id: 'wallet', icon: <Wallet size={20} /> },
    { id: 'banknote', icon: <Banknote size={20} /> },
    { id: 'home', icon: <Home size={20} /> },
    { id: 'shopping', icon: <ShoppingBag size={20} /> },
    { id: 'wifi', icon: <Wifi size={20} /> },
    { id: 'transport', icon: <Truck size={20} /> },
    { id: 'folder', icon: <Folder size={20} /> },
];

export default function CategoriesPage() {
    const navigate = useNavigate();
    const { user, impersonatedUser, rates } = useAuthStore();
    const activeUser = impersonatedUser || user;
    const [categories, setCategories] = useState<Category[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [loading, setLoading] = useState(true);

    const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
    const [showAddCategory, setShowAddCategory] = useState(false);
    const [showAddExpense, setShowAddExpense] = useState(false);
    const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense');
    const [familyId, setFamilyId] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [familyMembers, setFamilyMembers] = useState<any[]>([]);
    const [viewMode, setViewMode] = useState<'active' | 'archive'>('active');
    const [childWalletTotal, setChildWalletTotal] = useState(0);

    // Edit Category State
    const [editingCatId, setEditingCatId] = useState<string | null>(null);

    // Forms
    const [catName, setCatName] = useState("");
    const [catColor, setCatColor] = useState(COLORS[0]);
    const [catIcon, setCatIcon] = useState('folder');
    const [isShared, setIsShared] = useState(false);

    const [expName, setExpName] = useState("");
    const [expAmount, setExpAmount] = useState("");
    const [expDate, setExpDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [expDueDate, setExpDueDate] = useState("");
    const [isInstallment, setIsInstallment] = useState(false);
    const [installmentCount, setInstallmentCount] = useState("1");
    const [isAutoPay, setIsAutoPay] = useState(false);
    const [expCurrency, setExpCurrency] = useState('TRY');

    // Edit Expense State
    const [editingExpId, setEditingExpId] = useState<string | null>(null);
    const [editExpName, setEditExpName] = useState("");
    const [editExpAmount, setEditExpAmount] = useState("");
    const [editExpDate, setEditExpDate] = useState("");
    const [editExpCurrency, setEditExpCurrency] = useState('TRY');
    const [allExpenses, setAllExpenses] = useState<Expense[]>([]);

    // Fetch user's familyId and role
    useEffect(() => {
        if (!activeUser) return;
        const subs: any[] = [];

        const unsubUser = onSnapshot(doc(db, "users", activeUser.uid), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                const isOwner = activeUser.email === 'meoncu@gmail.com';
                setFamilyId(data.familyId || null);
                setUserRole(isOwner ? 'admin' : (data.role || 'member'));
            }
        });
        subs.push(unsubUser);

        return () => subs.forEach(s => s());
    }, [activeUser]);

    // Fetch Family Members for filtering
    useEffect(() => {
        if (!familyId) return;
        const qMembers = query(collection(db, "users"), where("familyId", "==", familyId));
        const unsubMembers = onSnapshot(qMembers, (snap) => {
            const m: any[] = [];
            snap.forEach(d => m.push({ id: d.id, ...d.data() }));
            setFamilyMembers(m);
        });
        return () => unsubMembers();
    }, [familyId]);

    // Fetch Categories (Mine + Shared)
    useEffect(() => {
        if (!activeUser) return;

        let q;
        if (familyId) {
            // Everyone listens to their own + shared family categories
            q = query(
                collection(db, "categories"),
                or(
                    where("userId", "==", activeUser.uid),
                    where("familyId", "==", familyId)
                )
            );
        } else {
            q = query(collection(db, "categories"), where("userId", "==", activeUser.uid));
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const cats: Category[] = [];
            snapshot.forEach((doc) => cats.push({ id: doc.id, ...doc.data() } as Category));
            setCategories(cats);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [activeUser, familyId, userRole]);

    // Fetch ALL expenses for the user (to calculate totals on the fly)
    useEffect(() => {
        if (!activeUser) return;
        const q = query(
            collection(db, "expenses"),
            where("userId", "==", activeUser.uid)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const exps: Expense[] = [];
            snapshot.forEach((doc) => exps.push({ id: doc.id, ...doc.data() } as Expense));
            setAllExpenses(exps);
        });
        return () => unsubscribe();
    }, [activeUser]);

    // Fetch Child Wallet Total (Virtual Category)
    useEffect(() => {
        if (!activeUser) return;
        const qWallet = query(
            collection(db, "expenses"),
            where("userId", "==", activeUser.uid),
            where("categoryId", "==", "child-wallet"),
            where("status", "==", "paid")
        );
        const unsubWallet = onSnapshot(qWallet, (snap) => {
            let total = 0;
            snap.forEach(d => {
                const data = d.data();
                const rate = rates[data.currency || 'TRY'] || 1;
                total += (data.amount || 0) * rate;
            });
            setChildWalletTotal(total);
        });
        return () => unsubWallet();
    }, [user, rates]);

    // Deep Link Effect: Check for ?id=... in URL
    useEffect(() => {
        if (loading || categories.length === 0) return;
        const params = new URLSearchParams(window.location.search);
        const catId = params.get('id');
        if (catId) {
            const target = categories.find(c => c.id === catId);
            if (target) {
                setSelectedCategory(target);
                window.history.replaceState({}, '', window.location.pathname);
            }
        }
    }, [loading, categories]);

    // Fetch Expenses when a category is selected
    useEffect(() => {
        if (!user || !selectedCategory) return;
        const q = query(collection(db, "expenses"), where("categoryId", "==", selectedCategory.id));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const exps: Expense[] = [];
            snapshot.forEach((doc) => exps.push({ id: doc.id, ...doc.data() } as Expense));
            // Sort by date asc (oldest first)
            exps.sort((a, b) => a.date?.seconds - b.date?.seconds);
            setExpenses(exps);
        });
        return () => unsubscribe();
    }, [user, selectedCategory]);

    const handleAddCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !catName) return;
        try {
            await addDoc(collection(db, "categories"), {
                userId: user.uid,
                name: catName,
                color: catColor,
                icon: catIcon,
                type: activeTab,
                familyId: isShared ? familyId : null,
                totalAmount: 0,
                createdAt: new Date()
            });
            setShowAddCategory(false);
            setCatName("");
            setIsShared(false);
        } catch (error) {
            console.error("Error adding category:", error);
        }
    };

    const handleUpdateCategory = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !editingCatId || !catName) return;
        try {
            const catRef = doc(db, "categories", editingCatId);
            await updateDoc(catRef, {
                name: catName,
                color: catColor,
                icon: catIcon,
                familyId: isShared ? familyId : null
            });
            setEditingCatId(null);
            setShowAddCategory(false);
            setCatName("");
            setIsShared(false);
        } catch (error) {
            console.error("Error updating category:", error);
        }
    };

    const startEditingCategory = (cat: Category, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingCatId(cat.id);
        setCatName(cat.name);
        setCatColor(cat.color);
        setCatIcon(cat.icon);
        setIsShared(!!cat.familyId);
        setShowAddCategory(true);
    };

    const handleAddExpense = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !selectedCategory || !expName || !expAmount) return;
        const amountVal = parseFloat(expAmount);
        const count = isInstallment ? parseInt(installmentCount) : 1;
        const [startYear, startMonth, startDay] = expDate.split('-').map(Number);
        const dueParts = expDueDate ? expDueDate.split('-').map(Number) : null;

        try {
            let totalAddedAmount = 0;
            const installmentGroupId = isInstallment ? `group_${Date.now()}` : null;

            for (let i = 0; i < count; i++) {
                // Calculate installment start date by preserving the original day as much as possible
                const currentMonthDate = new Date(startYear, startMonth - 1 + i, startDay);

                // Calculate installment due date
                let finalDueDate: Date;
                if (dueParts) {
                    finalDueDate = new Date(dueParts[0], dueParts[1] - 1 + i, dueParts[2]);
                } else {
                    // Default to last day of the installment month
                    finalDueDate = new Date(startYear, startMonth + i, 0);
                }

                const installmentLabel = isInstallment ? ` (${i + 1}/${count})` : "";

                await addDoc(collection(db, "expenses"), {
                    userId: user.uid,
                    categoryId: selectedCategory.id,
                    categoryName: selectedCategory.name,
                    name: `${expName}${installmentLabel}`,
                    amount: amountVal,
                    currency: expCurrency,
                    date: currentMonthDate,
                    dueDate: finalDueDate,
                    status: 'unpaid',
                    type: selectedCategory.type,
                    familyId: selectedCategory.familyId || null,
                    isAutoPay: isAutoPay, // Allowed for both income and expense
                    location: isAutoPay ? 'Bankada' : 'Kasa',
                    installmentGroupId
                });

                const rate = rates[expCurrency] || 1;
                totalAddedAmount += (amountVal * rate);
            }

            // Update Category Total
            const catRef = doc(db, "categories", selectedCategory.id);
            await updateDoc(catRef, {
                totalAmount: increment(totalAddedAmount)
            });

            setShowAddExpense(false);
            setExpName("");
            setExpAmount("");
            setExpDueDate("");
            setIsInstallment(false);
            setInstallmentCount("1");
            setIsAutoPay(false);
            setExpCurrency('TRY');
        } catch (error) {
            console.error("Error adding expense:", error);
        }
    };

    const togglePaymentStatus = async (exp: Expense) => {
        if (!user) return;
        const newStatus = exp.status === 'paid' ? 'unpaid' : 'paid';
        try {
            await updateDoc(doc(db, "expenses", exp.id), {
                status: newStatus,
                paidBy: newStatus === 'paid' ? user.uid : null,
                paidByEmail: newStatus === 'paid' ? (user.displayName || user.email) : null
            });
        } catch (error) {
            console.error("Payment update error:", error);
        }
    };

    const handleUpdateExpense = async (e: React.FormEvent, exp: Expense) => {
        e.preventDefault();
        if (!user || !selectedCategory || !editExpName || !editExpAmount) return;

        const newAmount = parseFloat(editExpAmount.replace(/\D/g, ""));
        const oldRate = rates[exp.currency || 'TRY'] || 1;
        const newRate = rates[editExpCurrency] || 1;

        try {
            await updateDoc(doc(db, "expenses", exp.id), {
                name: editExpName,
                amount: newAmount,
                currency: editExpCurrency,
                date: new Date(editExpDate)
            });

            // Re-calculate category total correctly
            const catRef = doc(db, "categories", selectedCategory.id);
            const diffInTry = (newAmount * newRate) - (exp.amount * oldRate);

            if (diffInTry !== 0) {
                await updateDoc(catRef, {
                    totalAmount: increment(diffInTry)
                });
            }
            setEditingExpId(null);
        } catch (error) {
            console.error("Update error:", error);
        }
    };

    const startEditing = (exp: Expense) => {
        setEditingExpId(exp.id);
        setEditExpName(exp.name);
        setEditExpAmount(exp.amount.toString());
        setEditExpDate(exp.date?.seconds ? format(new Date(exp.date.seconds * 1000), 'yyyy-MM-dd') : "");
        setEditExpCurrency(exp.currency || 'TRY');
    };

    const handleDeleteCategory = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Bu grubu silmek istediğinize emin misiniz? İçindeki tüm harcamalar da kalıcı olarak silinecektir.")) return;
        try {
            // 1. First, find and delete all expenses in this category
            const q = query(collection(db, "expenses"), where("categoryId", "==", id));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const batch = writeBatch(db);
                querySnapshot.forEach((doc) => {
                    batch.delete(doc.ref);
                });
                await batch.commit();
            }

            // 2. Finally, delete the category itself
            await deleteDoc(doc(db, "categories", id));
            if (selectedCategory?.id === id) setSelectedCategory(null);
        } catch (error) {
            console.error("Error deleting category and expenses:", error);
            alert("Silme işlemi sırasında bir hata oluştu.");
        }
    };

    const handleDeleteExpense = async (exp: Expense) => {
        if (!user || !selectedCategory) return;
        if (!confirm("Bu kaydı silmek istediğinize emin misiniz?")) return;
        try {
            await deleteDoc(doc(db, "expenses", exp.id));
            const catRef = doc(db, "categories", selectedCategory.id);
            const rate = rates[exp.currency || 'TRY'] || 1;
            await updateDoc(catRef, {
                totalAmount: increment(-(exp.amount * rate))
            });
        } catch (err) {
            console.error(err);
        }
    }

    const getIcon = (id: string) => ICONS.find(i => i.id === id)?.icon || <Folder size={20} />;

    const formatAmountInput = (val: string) => {
        // Remove everything except numbers
        const numeric = val.replace(/\D/g, "");
        if (!numeric) return "";
        // Format with dots
        return new Intl.NumberFormat('tr-TR').format(parseInt(numeric));
    };

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        const numeric = val.replace(/\D/g, "");
        setExpAmount(numeric); // Keep raw numeric in state
    };

    return (
        <div className="min-h-screen bg-background pb-24 animate-fade-in font-sans">
            {/* Header */}
            <div className="p-6 pt-8 flex items-center justify-between border-b border-border/40 bg-card/30 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => {
                        if (selectedCategory) setSelectedCategory(null);
                        else navigate('/');
                    }} className="-ml-2">
                        <ChevronLeft className="h-6 w-6" />
                    </Button>
                    <h1 className="text-xl font-bold">{selectedCategory ? selectedCategory.name : (activeTab === 'expense' ? 'Gider Grupları' : 'Gelir Grupları')}</h1>
                </div>
                <div>
                    {userRole === 'admin' && (
                        selectedCategory ? (
                            <Button size="icon" className="rounded-full h-10 w-10 shadow-lg bg-primary hover:bg-primary/90" onClick={() => setShowAddExpense(true)}>
                                <Plus className="h-6 w-6 text-primary-foreground" />
                            </Button>
                        ) : (
                            <Button size="icon" className="rounded-full h-10 w-10 shadow-lg bg-primary hover:bg-primary/90" onClick={() => setShowAddCategory(true)}>
                                <Plus className="h-6 w-6 text-primary-foreground" />
                            </Button>
                        )
                    )}
                </div>
            </div>

            <div className="p-6 space-y-6">
                {/* Tab Switcher */}
                {!selectedCategory && (
                    <div className="bg-muted p-1 rounded-xl flex gap-1">
                        <button
                            onClick={() => setActiveTab('expense')}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all",
                                activeTab === 'expense' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <TrendingDown size={18} className={cn(activeTab === 'expense' ? "text-rose-500" : "")} />
                            Giderler
                        </button>
                        <button
                            onClick={() => setActiveTab('income')}
                            className={cn(
                                "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all",
                                activeTab === 'income' ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            <TrendingUp size={18} className={cn(activeTab === 'income' ? "text-emerald-500" : "")} />
                            Gelirler
                        </button>
                    </div>
                )}

                {/* ADD/EDIT CATEGORY FORM */}
                {showAddCategory && !selectedCategory && (
                    <Card className="border-primary/20 shadow-lg mb-6 animate-in slide-in-from-top-4">
                        <CardHeader><CardTitle className="text-base">{editingCatId ? 'Grubu Düzenle' : 'Yeni Grup Oluştur'}</CardTitle></CardHeader>
                        <CardContent>
                            <form onSubmit={editingCatId ? handleUpdateCategory : handleAddCategory} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs uppercase text-muted-foreground font-semibold">Grup Adı</label>
                                    <Input placeholder="Örn: Ev Faturaları" value={catName} onChange={e => setCatName(e.target.value)} autoFocus />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs uppercase text-muted-foreground font-semibold">Renk</label>
                                    <div className="flex gap-2 flex-wrap">
                                        {COLORS.map(c => (
                                            <div key={c} onClick={() => setCatColor(c)} className={cn("w-8 h-8 rounded-full cursor-pointer transition-transform hover:scale-110 ring-2 ring-offset-2 ring-offset-background", c, catColor === c ? 'ring-primary' : 'ring-transparent')} />
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs uppercase text-muted-foreground font-semibold">İkon</label>
                                    <div className="flex gap-2 flex-wrap">
                                        {ICONS.map(i => (
                                            <div key={i.id} onClick={() => setCatIcon(i.id)} className={cn("w-10 h-10 rounded-xl flex items-center justify-center cursor-pointer border hover:bg-muted transition-colors", catIcon === i.id ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground')} >
                                                {i.icon}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {familyId && (
                                    <div className="flex items-center space-x-2 py-2 border-t border-border mt-2 pt-4">
                                        <input
                                            type="checkbox"
                                            id="isShared"
                                            checked={isShared}
                                            onChange={(e) => setIsShared(e.target.checked)}
                                            className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary cursor-pointer border-2"
                                        />
                                        <label htmlFor="isShared" className="text-sm font-medium leading-none cursor-pointer flex items-center gap-2">
                                            <Share2 size={16} className="text-blue-500" />
                                            Bu grubu aile üyeleriyle paylaş
                                        </label>
                                    </div>
                                )}

                                <div className="flex gap-2 pt-2">
                                    <Button type="button" variant="outline" className="flex-1" onClick={() => {
                                        setShowAddCategory(false);
                                        setEditingCatId(null);
                                        setCatName("");
                                        setCatColor(COLORS[0]);
                                        setCatIcon(ICONS[0].id);
                                        setIsShared(false);
                                    }}>İptal</Button>
                                    <Button type="submit" className="flex-1">{editingCatId ? 'Güncelle' : 'Oluştur'}</Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                )}

                {/* ADD EXPENSE/INCOME FORM */}
                {showAddExpense && selectedCategory && (
                    <Card className="border-primary/20 shadow-lg mb-6 animate-in slide-in-from-top-4">
                        <CardHeader><CardTitle className="text-base">{selectedCategory.type === 'income' ? 'Gelir Ekle' : 'Fatura/Gider Ekle'}</CardTitle></CardHeader>
                        <CardContent>
                            <form onSubmit={handleAddExpense} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs uppercase text-muted-foreground font-semibold">{selectedCategory.type === 'income' ? 'Gelir Adı' : 'Gider Adı'}</label>
                                    <Input placeholder={selectedCategory.type === 'income' ? "Örn: Maaş" : "Örn: Ocak Ayı Kira"} value={expName} onChange={e => setExpName(e.target.value)} autoFocus />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs uppercase text-muted-foreground font-semibold">Tutar</label>
                                        <div className="flex gap-2">
                                            <select
                                                value={expCurrency}
                                                onChange={(e) => setExpCurrency(e.target.value)}
                                                className="bg-muted/50 border-none rounded-lg px-2 text-sm font-bold focus:ring-2 focus:ring-primary h-10 transition-all outline-none"
                                            >
                                                {CURRENCIES.map(c => (
                                                    <option key={c.code} value={c.code}>{c.symbol}</option>
                                                ))}
                                            </select>
                                            <Input
                                                type="text"
                                                inputMode="numeric"
                                                placeholder="0"
                                                value={formatAmountInput(expAmount)}
                                                onChange={handleAmountChange}
                                                className="flex-1"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs uppercase text-muted-foreground font-semibold">Tarih</label>
                                        <Input type="date" value={expDate} onChange={e => setExpDate(e.target.value)} h-10 />
                                    </div>
                                </div>

                                {selectedCategory.type === 'expense' && (
                                    <div className="space-y-2">
                                        <label className="text-xs uppercase text-muted-foreground font-semibold">Son Ödeme Tarihi (İsteğe Bağlı)</label>
                                        <Input type="date" value={expDueDate} onChange={e => setExpDueDate(e.target.value)} />
                                        <p className="text-[10px] text-muted-foreground italic">* Boş bırakılırsa ayın son günü baz alınır.</p>
                                    </div>
                                )}

                                <div className="flex items-center space-x-2 py-2">
                                    <input
                                        type="checkbox"
                                        id="isInstallment"
                                        checked={isInstallment}
                                        onChange={(e) => setIsInstallment(e.target.checked)}
                                        className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary cursor-pointer border-2"
                                    />
                                    <label htmlFor="isInstallment" className="text-sm font-medium leading-none cursor-pointer">
                                        Taksitli / Tekrarlayan İşlem
                                    </label>
                                </div>

                                {selectedCategory && (
                                    <div className="flex items-center space-x-2 py-2 border-t border-border/20 mt-2 pt-2">
                                        <input
                                            type="checkbox"
                                            id="isAutoPay"
                                            checked={isAutoPay}
                                            onChange={(e) => setIsAutoPay(e.target.checked)}
                                            className={cn(
                                                "w-4 h-4 border-gray-300 rounded cursor-pointer border-2",
                                                selectedCategory.type === 'income' ? "text-emerald-600 focus:ring-emerald-500" : "text-emerald-600 focus:ring-emerald-500"
                                            )}
                                        />
                                        <label htmlFor="isAutoPay" className={cn(
                                            "text-sm font-medium leading-none cursor-pointer flex items-center gap-1.5",
                                            selectedCategory.type === 'income' ? "text-emerald-700 dark:text-emerald-400" : "text-emerald-700 dark:text-emerald-400"
                                        )}>
                                            <Banknote size={14} /> {selectedCategory.type === 'income' ? 'Günü Geldiğinde Otomatik Tahsil Et' : 'Otomatik Banka Ödemesi'}
                                        </label>
                                    </div>
                                )}

                                {isInstallment && (
                                    <div className="space-y-2 animate-in fade-in zoom-in-95 duration-200">
                                        <label className="text-xs uppercase text-muted-foreground font-semibold">Taksit Sayısı (Ay)</label>
                                        <Input
                                            type="number"
                                            min="1"
                                            max="60"
                                            value={installmentCount}
                                            onChange={e => setInstallmentCount(e.target.value)}
                                        />
                                        <p className="text-[10px] text-muted-foreground italic">
                                            * Belirlediğiniz tutar her ay için ayrı ayrı eklenecektir.
                                        </p>
                                    </div>
                                )}

                                <div className="flex gap-2 pt-2">
                                    <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAddExpense(false)}>İptal</Button>
                                    <Button type="submit" className="flex-1">
                                        {isInstallment ? `${installmentCount} Taksit Ekle` : (selectedCategory.type === 'income' ? 'Geliri Kaydet' : 'Gideri Kaydet')}
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                )}

                {/* CATEGORIES LIST */}
                {!selectedCategory && (
                    <div className="grid grid-cols-2 gap-4">
                        {(() => {
                            const filteredCats = categories
                                .filter(c => (c.type || 'expense') === activeTab)
                                .filter(cat => {
                                    if (userRole === 'admin') return true;
                                    if (cat.userId === user?.uid) return true;
                                    if (!cat.familyId) return false;

                                    const otherMembers = familyMembers.filter(m => m.id !== user?.uid);
                                    const categoryNameClean = cat.name.toLocaleLowerCase('tr-TR').replace(/\s+/g, '');

                                    const isForSomeoneElse = otherMembers.some(m => {
                                        const fullName = (m.displayName || '').toLocaleLowerCase('tr-TR');
                                        const names = fullName.split(' ').filter((n: string) => n.length > 2);
                                        const firstName = names[0] || '';
                                        const firstNameClean = firstName.replace(/\s+/g, '');
                                        if (!firstNameClean) return false;
                                        return (categoryNameClean.includes(firstNameClean) || firstNameClean.includes(categoryNameClean));
                                    });

                                    if (isForSomeoneElse) return false;
                                    return true;
                                });

                            const displayCats = [...filteredCats];
                            // Inject Harçlıklar for anyone in a family when on Income tab
                            if (activeTab === 'income' && familyId) {
                                displayCats.push({
                                    id: 'child-wallet',
                                    name: 'Harçlıklar',
                                    totalAmount: childWalletTotal,
                                    type: 'income',
                                    color: 'bg-emerald-500',
                                    icon: 'trending-up',
                                    userId: user?.uid
                                });
                            }

                            if (displayCats.length === 0 && !loading) {
                                return (
                                    <div className="col-span-2 text-center py-12 text-muted-foreground">
                                        <Folder className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p>Henüz hiç {activeTab === 'expense' ? 'gider' : 'gelir'} grubu bulunmuyor.</p>
                                        {userRole === 'admin' && <p className="text-xs">Eklemek için + butonuna basın.</p>}
                                    </div>
                                );
                            }

                            return displayCats.map(cat => (
                                <div
                                    key={cat.id}
                                    onClick={() => setSelectedCategory(cat)}
                                    className="bg-card hover:bg-muted/50 border border-border/50 p-4 rounded-2xl cursor-pointer transition-all hover:shadow-md group relative"
                                >
                                    <div className="absolute top-2 right-2 flex opacity-0 group-hover:opacity-100 transition-opacity">
                                        {userRole === 'admin' && cat.id !== 'child-wallet' && (
                                            <>
                                                <button onClick={(e) => startEditingCategory(cat, e)} className="p-2 text-muted-foreground hover:text-primary">
                                                    <Edit2 size={16} />
                                                </button>
                                                <button onClick={(e) => handleDeleteCategory(cat.id, e)} className="p-2 text-muted-foreground hover:text-destructive">
                                                    <Trash2 size={16} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-white mb-3 shadow-sm", cat.color)}>
                                        {getIcon(cat.icon)}
                                    </div>
                                    <div className="flex items-center gap-1 mb-1">
                                        <h3 className="font-semibold text-foreground truncate flex-1">{cat.name}</h3>
                                        {cat.familyId && <Share2 size={12} className="text-blue-500" />}
                                    </div>
                                    <p className="text-sm text-muted-foreground font-medium text-emerald-600 dark:text-emerald-400">
                                        {cat.type === 'income' ? '+' : ''}₺{(cat.id === 'child-wallet' ? childWalletTotal : (
                                            allExpenses
                                                .filter(e => e.categoryId === cat.id && (cat.type === 'income' ? e.status === 'paid' : true))
                                                .reduce((sum, e) => sum + (e.amount * (rates[e.currency || 'TRY'] || 1)), 0)
                                        )).toLocaleString('tr-TR')}
                                    </p>
                                </div>
                            ));
                        })()}
                    </div>
                )}

                {/* EXPENSES LIST WITH ARCHIVE LOGIC */}
                {selectedCategory && (
                    <div className="space-y-4">
                        {/* View Toggle */}
                        <div className="flex bg-muted/50 p-1 rounded-xl w-fit mx-auto mb-4 border border-border/40">
                            <button
                                onClick={() => setViewMode('active')}
                                className={cn(
                                    "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                                    viewMode === 'active' ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Aktif İşlemler
                                {expenses.filter(e => e.status === 'unpaid').length > 0 && (
                                    <span className="bg-rose-500 text-white w-4 h-4 rounded-full flex items-center justify-center text-[8px]">
                                        {expenses.filter(e => e.status === 'unpaid').length}
                                    </span>
                                )}
                            </button>
                            <button
                                onClick={() => setViewMode('archive')}
                                className={cn(
                                    "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                                    viewMode === 'archive' ? "bg-card text-emerald-600 shadow-sm" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Arşiv
                            </button>
                        </div>

                        <div className="space-y-3">
                            {(() => {
                                let filteredExpenses: Expense[] = [];

                                if (viewMode === 'active') {
                                    filteredExpenses = expenses
                                        .filter(exp => exp.categoryId === selectedCategory.id && exp.status === 'unpaid')
                                        .sort((a, b) => (a.dueDate?.seconds || 0) - (b.dueDate?.seconds || 0));
                                } else {
                                    filteredExpenses = expenses
                                        .filter(exp => exp.categoryId === selectedCategory.id && exp.status === 'paid')
                                        .sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
                                }

                                if (filteredExpenses.length === 0) {
                                    return (
                                        <div className="text-center py-12 text-muted-foreground bg-muted/10 rounded-3xl border border-dashed border-border/50">
                                            <Clock className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                            <p>{viewMode === 'active' ? 'Aktif işlem bulunmuyor.' : 'Arşivlenmiş (tamamlanmış) işlem yok.'}</p>
                                        </div>
                                    );
                                }

                                return filteredExpenses.map(exp => (
                                    <div key={exp.id} className={cn(
                                        "p-4 bg-card border rounded-2xl transition-all group",
                                        exp.status === 'paid' ? "border-emerald-500/20 bg-emerald-500/5 shadow-sm" : "border-border/50",
                                        editingExpId === exp.id ? "ring-2 ring-primary border-transparent" : "hover:shadow-sm"
                                    )}>
                                        {editingExpId === exp.id ? (
                                            <form onSubmit={(e) => handleUpdateExpense(e, exp)} className="space-y-3">
                                                <div className="flex gap-2">
                                                    <Input
                                                        className="flex-1 h-9"
                                                        value={editExpName}
                                                        onChange={e => setEditExpName(e.target.value)}
                                                        autoFocus
                                                    />
                                                    <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground" onClick={() => setEditingExpId(null)}>
                                                        <X size={16} />
                                                    </Button>
                                                </div>
                                                <div className="flex gap-2">
                                                    <select
                                                        value={editExpCurrency}
                                                        onChange={(e) => setEditExpCurrency(e.target.value)}
                                                        className="bg-muted/50 border-none rounded-lg px-2 text-xs font-bold focus:ring-2 focus:ring-primary h-9 transition-all outline-none"
                                                    >
                                                        {CURRENCIES.map(c => (
                                                            <option key={c.code} value={c.code}>{c.symbol}</option>
                                                        ))}
                                                    </select>
                                                    <Input
                                                        className="flex-1 h-9"
                                                        value={formatAmountInput(editExpAmount)}
                                                        onChange={e => setEditExpAmount(e.target.value.replace(/\D/g, ""))}
                                                        placeholder="Tutar"
                                                    />
                                                    <Input
                                                        type="date"
                                                        className="w-[120px] h-9 text-xs"
                                                        value={editExpDate}
                                                        onChange={e => setEditExpDate(e.target.value)}
                                                    />
                                                    <Button type="submit" size="sm" className="h-9 px-3 text-[10px] font-bold">KAYDET</Button>
                                                </div>
                                            </form>
                                        ) : (
                                            <>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <button
                                                            onClick={() => userRole === 'admin' && togglePaymentStatus(exp)}
                                                            className={cn(
                                                                "w-10 h-10 rounded-full flex items-center justify-center transition-colors shadow-sm",
                                                                exp.status === 'paid' ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground hover:bg-emerald-500/10",
                                                                userRole !== 'admin' && "cursor-default"
                                                            )}
                                                        >
                                                            {exp.status === 'paid' ? <Check size={18} /> : <Clock size={18} />}
                                                        </button>
                                                        <div>
                                                            <p className={cn("font-semibold transition-all mb-0.5", exp.status === 'paid' && "line-through text-muted-foreground opacity-70")}>
                                                                {exp.name}
                                                            </p>
                                                            <div className="flex flex-col gap-0.5 mt-1">
                                                                <div className="flex gap-2 text-[10px] font-medium uppercase tracking-wider">
                                                                    <span className="text-muted-foreground">
                                                                        Ödeme Dönemi: {exp.date?.seconds ? (
                                                                            `${format(startOfMonth(new Date(exp.date.seconds * 1000)), "d MMM", { locale: tr })} - ${format(endOfMonth(new Date(exp.date.seconds * 1000)), "d MMM", { locale: tr })}`
                                                                        ) : '-'}
                                                                    </span>
                                                                    {exp.dueDate && selectedCategory.type === 'expense' && (
                                                                        <span className={cn(
                                                                            exp.status === 'unpaid' && new Date(exp.dueDate.seconds * 1000) < new Date() ? "text-rose-500 font-bold" : "text-muted-foreground"
                                                                        )}>
                                                                            • Son Tarih: {format(new Date(exp.dueDate.seconds * 1000), "d MMM", { locale: tr })}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {exp.status === 'paid' && exp.paidByEmail && (
                                                                    <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-1 bg-emerald-500/10 w-fit px-1.5 py-0.5 rounded-full">
                                                                        <Check size={10} /> {exp.paidByEmail} tarafından ödendi
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <span className={cn("font-bold tabular-nums mr-2", exp.status === 'paid' ? "text-emerald-600" : "text-foreground")}>
                                                            {selectedCategory.type === 'income' ? '+' : ''}{CURRENCIES.find(c => c.code === (exp.currency || 'TRY'))?.symbol || '₺'}{exp.amount?.toLocaleString('tr-TR')}
                                                        </span>
                                                        <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                                                            {userRole === 'admin' && (
                                                                <>
                                                                    <button onClick={() => startEditing(exp)} className="text-muted-foreground hover:text-primary p-2">
                                                                        <Edit2 size={16} />
                                                                    </button>
                                                                    <button onClick={() => handleDeleteExpense(exp)} className="text-muted-foreground hover:text-destructive p-2">
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))
                            })()}
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Nav */}
            <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-lg border-t border-border p-2 px-6 flex justify-between items-center z-50 pb-6 pt-3 shadow-lg-up">
                <NavItem icon={<Home size={22} />} label="Özet" onClick={() => navigate('/')} />
                <NavItem icon={<Folder size={22} />} label="Gruplar" active onClick={() => navigate('/categories')} />
                <NavItem icon={<Users size={22} />} label="Aile" onClick={() => navigate('/family')} />
                <NavItem icon={<PieChart size={22} />} label="Raporlar" onClick={() => navigate('/reports')} />
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
