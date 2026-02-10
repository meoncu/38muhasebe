import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

export default function ProtectedRoute({ children, allowPending = false }: { children: React.ReactNode, allowPending?: boolean }) {
    const { user, loading, setUser, setLoading } = useAuthStore();
    const [dbLoading, setDbLoading] = useState(true);
    const [isApproved, setIsApproved] = useState<boolean | null>(null);
    const [hasFamily, setHasFamily] = useState<boolean | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [setUser, setLoading]);

    useEffect(() => {
        if (loading) return;

        if (!user) {
            setDbLoading(false);
            setIsApproved(false);
            setHasFamily(false);
            setRole(null);
            return;
        }

        // Listen to user document for approval status
        const userDocRef = doc(db, "users", user.uid);
        const unsubscribeUser = onSnapshot(userDocRef, { includeMetadataChanges: false }, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const isOwner = user.email === 'meoncu@gmail.com';
                setIsApproved(!!data.isApproved || data.role === 'admin' || isOwner);
                setHasFamily(!!data.familyId);
                setRole(isOwner ? 'admin' : (data.role || null));
            } else {
                const isOwner = user.email === 'meoncu@gmail.com';
                setIsApproved(isOwner);
                setHasFamily(false);
                setRole(isOwner ? 'admin' : null);
            }
            setDbLoading(false);
        }, (error) => {
            console.error("ProtectedRoute Firestore Error:", error);
            setIsApproved(false);
            setHasFamily(false);
            setDbLoading(false);
        });

        return () => {
            unsubscribeUser();
        };
    }, [user?.uid, user?.email, loading]);

    useEffect(() => {
        if (loading || dbLoading) return;

        if (!user) {
            navigate('/login');
            return;
        }

        const effectiveApproved = isApproved || role === 'admin';

        // If user IS NOT approved, they MUST go to pending
        if (!effectiveApproved && !allowPending && location.pathname !== '/profile') {
            navigate('/pending');
            return;
        }

        // If user IS approved and tries to visit /pending, take them home
        if (effectiveApproved && location.pathname === '/pending') {
            navigate('/');
            return;
        }

        // If user has NO family, they MUST go to family page to join/create
        if (!hasFamily && location.pathname !== '/family' && location.pathname !== '/profile') {
            navigate('/family');
            return;
        }
    }, [user, loading, dbLoading, isApproved, hasFamily, role, navigate, location.pathname, allowPending]);

    if (loading || dbLoading) {
        return (
            <div className="h-screen w-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!user) return null;

    return <>{children}</>;
}
