import { Head, router } from '@inertiajs/react';
import {
    Alert,
    Badge,
    Box,
    Button,
    Checkbox,
    Group,
    Image,
    LoadingOverlay,
    Modal,
    NativeSelect,
    Stack,
    Table,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';

import AppShellLayout from '@/layouts/AppShellLayout';
import DataTableCard from '@/components/ui/DataTableCard';
import EmptyState from '@/components/ui/EmptyState';
import TablePaginationBar, { paginationFields } from '@/components/ui/TablePaginationBar';
import { apiJson, webUrl } from '@/lib/api';

const ALL_PLATFORMS = [
    { value: 'ecocash',   label: 'EcoCash',   logo: '/payment-platform-logos/ecocash.png' },
    { value: 'omari',     label: 'Omari',      logo: '/payment-platform-logos/omari.png' },
    { value: 'zimswitch', label: 'ZimSwitch',  logo: '/payment-platform-logos/zimswitch.png' },
] as const;

type Platform = typeof ALL_PLATFORMS[number]['value'];

type ProductOption = { id: number; team_id: number | null; name: string; description: string | null };
type ProductRef    = { id: number; team_id: number | null; name: string; description: string | null };

type PlanRow = {
    id: number | null;
    team_id: number | null;
    product_id: number;
    name: string;
    billing_interval: string;
    price: string;
    currency: string;
    trial_days?: number | null;
    payment_platforms: Platform[];
    product: ProductRef | null;
};

type BillingIntervalOption = { value: string; label: string; is_recurring: boolean };

type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

function formatBillingSummary(interval: string, price: string, billingIntervals: BillingIntervalOption[]): string {
    const config = billingIntervals.find((b) => b.value === interval);
    if (!config) return `${price} / ${interval}`;
    return config.is_recurring ? `${price} / ${config.label}` : `${price} · ${config.label}`;
}

function PlatformLogos({ platforms }: { platforms: Platform[] }) {
    if (!platforms || platforms.length === 0) return <Text size="xs" c="dimmed">None</Text>;
    return (
        <Group gap={4} wrap="nowrap">
            {ALL_PLATFORMS.filter((p) => platforms.includes(p.value)).map((p) => (
                <Tooltip key={p.value} label={p.label} withArrow>
                    <Image src={p.logo} h={22} w="auto" fit="contain" alt={p.label} />
                </Tooltip>
            ))}
        </Group>
    );
}

export default function Index({
    items,
    filters,
    products,
    billingIntervals,
}: {
    items: Paginated<PlanRow>;
    filters: { q: string; per_page: number; product_id?: number | null };
    products: ProductOption[];
    billingIntervals: BillingIntervalOption[];
}) {
    const [q, setQ] = useState(filters.q ?? '');
    const [productFilter, setProductFilter] = useState(filters.product_id ? String(filters.product_id) : '');
    const [open, setOpen]               = useState(false);
    const [editing, setEditing]         = useState<PlanRow | null>(null);
    const [productId, setProductId]     = useState(products[0] ? String(products[0].id) : '');
    const [planName, setPlanName]       = useState('');
    const [billingInterval, setBillingInterval] = useState(() => billingIntervals[0]?.value ?? 'monthly');
    const [price, setPrice]             = useState('');
    const [currency, setCurrency]       = useState('USD');
    const [trialDays, setTrialDays]     = useState<string>('');
    const [platforms, setPlatforms]     = useState<Platform[]>(['ecocash', 'omari', 'zimswitch']);
    const [busy, setBusy]               = useState(false);
    const [err, setErr]                 = useState<string | null>(null);

    const productSelectData = useMemo(
        () => products.map((p) => ({ value: String(p.id), label: p.name })),
        [products],
    );

    useEffect(() => {
        const t = window.setTimeout(() => {
            router.get(
                '/plans',
                { q, page: 1, per_page: filters.per_page, product_id: productFilter || undefined },
                { preserveState: true, preserveScroll: true, replace: true },
            );
        }, 300);
        return () => window.clearTimeout(t);
    }, [q, filters.per_page, productFilter]);

    function openCreate() {
        setEditing(null);
        setProductId(products[0] ? String(products[0].id) : '');
        setPlanName('');
        setBillingInterval(billingIntervals[0]?.value ?? 'monthly');
        setPrice('');
        setCurrency('USD');
        setTrialDays('');
        setPlatforms(['ecocash', 'omari', 'zimswitch']);
        setErr(null);
        setOpen(true);
    }

    function openEdit(p: PlanRow) {
        setEditing(p);
        setProductId(String(p.product_id));
        setPlanName(p.name);
        setBillingInterval(p.billing_interval);
        setPrice(p.price);
        setCurrency(p.currency);
        setTrialDays(p.trial_days === null || p.trial_days === undefined ? '' : String(p.trial_days));
        setPlatforms(p.payment_platforms ?? ['ecocash', 'omari', 'zimswitch']);
        setErr(null);
        setOpen(true);
    }

    function togglePlatform(value: Platform) {
        setPlatforms((prev) =>
            prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
        );
    }

    async function submit() {
        setBusy(true);
        setErr(null);
        try {
            const trial_days =
                trialDays.trim() === '' ? null : Number.parseInt(trialDays.trim(), 10);
            if (trial_days !== null && (!Number.isFinite(trial_days) || trial_days < 0)) {
                throw new Error('Trial days must be a whole number (0 or more).');
            }

            const body = {
                product_id: Number(productId),
                name: planName.trim(),
                billing_interval: billingInterval,
                price: price.trim(),
                currency: currency.trim().toUpperCase(),
                trial_days,
                payment_platforms: platforms,
            };
            if (editing) {
                await apiJson(webUrl(`/plans/${editing.id}`), { method: 'PATCH', body: JSON.stringify(body) });
            } else {
                await apiJson(webUrl('/plans'), { method: 'POST', body: JSON.stringify(body) });
            }
            setOpen(false);
            router.reload();
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'Request failed');
        } finally {
            setBusy(false);
        }
    }

    async function remove(p: PlanRow) {
        if (!window.confirm(`Delete plan "${p.name}"? This will fail if active subscriptions use it.`)) return;
        setBusy(true);
        try {
            await apiJson(webUrl(`/plans/${p.id}`), { method: 'DELETE' });
            router.reload();
        } catch (e) {
            window.alert(e instanceof Error ? e.message : 'Delete failed');
        } finally {
            setBusy(false);
        }
    }

    const canCreatePlan = products.length > 0;

    return (
        <AppShellLayout
            title="Plans"
            subtitle="Price and bill customers with one-time or recurring plans tied to products."
            actions={
                <Button onClick={openCreate} color="red" disabled={!canCreatePlan}>
                    Add plan
                </Button>
            }
        >
            <Head title="Plans" />
            {!canCreatePlan ? (
                <Alert color="amber" title="Create a product first" mb="md">
                    Plans must be attached to a product. Add at least one product on the Products page, then
                    return here to create plans.
                </Alert>
            ) : null}
            <Stack gap="md">
                <Group justify="space-between" align="center" wrap="wrap">
                    <Group gap="sm" wrap="wrap">
                        <TextInput
                            placeholder="Search plan name, product, or billing interval…"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            maw={360}
                        />
                        <NativeSelect
                            aria-label="Filter by product"
                            value={productFilter}
                            onChange={(e) => setProductFilter(e.currentTarget.value)}
                            data={[
                                { value: '', label: 'All products' },
                                ...products.map((p) => ({ value: String(p.id), label: p.name })),
                            ]}
                            w={220}
                        />
                    </Group>
                    <Text size="sm" c="dimmed">
                        {items.data.length} of {items.total} shown
                    </Text>
                </Group>
            <Box pos="relative">
                <LoadingOverlay visible={busy} zIndex={1} />
                {items.data.length === 0 ? (
                    <EmptyState
                        title={q ? 'No matches' : 'No plans yet'}
                        description={
                            q
                                ? 'Try a different search.'
                                : 'Define one-time purchases or recurring monthly or yearly billing.'
                        }
                        action={
                            !q && canCreatePlan ? (
                                <Button onClick={openCreate} color="red">Add plan</Button>
                            ) : undefined
                        }
                    />
                ) : (
                    <>
                    <DataTableCard>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Plan</Table.Th>
                                <Table.Th>Pricing</Table.Th>
                                <Table.Th>Trial</Table.Th>
                                <Table.Th>Product</Table.Th>
                                <Table.Th>Payment platforms</Table.Th>
                                <Table.Th w={140} />
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {items.data.map((p) => (
                                <Table.Tr key={p.id ?? p.name}>
                                    <Table.Td fw={600}>{p.name}</Table.Td>
                                    <Table.Td>
                                        <Group gap="xs">
                                            <Badge variant="light" color="red">{p.currency}</Badge>
                                            <Text size="sm">
                                                {formatBillingSummary(p.billing_interval, p.price, billingIntervals)}
                                            </Text>
                                        </Group>
                                    </Table.Td>
                                    <Table.Td>
                                        {p.trial_days ? (
                                            <Badge variant="light" color="gray">{p.trial_days} days</Badge>
                                        ) : (
                                            <Text size="xs" c="dimmed">None</Text>
                                        )}
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {p.product?.name ?? `Product #${p.product_id}`}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <PlatformLogos platforms={p.payment_platforms} />
                                    </Table.Td>
                                    <Table.Td>
                                        <Group gap="xs" justify="flex-end" wrap="nowrap">
                                            <Button variant="light" size="xs" onClick={() => openEdit(p)}>
                                                Edit
                                            </Button>
                                            <Button variant="light" color="red" size="xs" onClick={() => remove(p)}>
                                                Delete
                                            </Button>
                                        </Group>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </DataTableCard>
                    <TablePaginationBar
                        meta={paginationFields(items)}
                        q={q}
                        path="/plans"
                        extraParams={{ product_id: productFilter || undefined }}
                    />
                    </>
                )}
            </Box>
            </Stack>

            <Modal
                opened={open}
                onClose={() => setOpen(false)}
                title={editing ? 'Edit plan' : 'New plan'}
                centered
                size="md"
            >
                <Stack gap="md">
                    {err && <Alert color="red" title="Could not save">{err}</Alert>}

                    <NativeSelect
                        label="Product"
                        data={productSelectData}
                        value={productId}
                        onChange={(e) => setProductId(e.currentTarget.value)}
                        disabled={!canCreatePlan}
                        required
                    />
                    <TextInput
                        label="Plan name"
                        placeholder="e.g. Pro"
                        value={planName}
                        onChange={(e) => setPlanName(e.target.value)}
                        required
                    />
                    <NativeSelect
                        label="Billing"
                        data={billingIntervals.map((b) => ({ value: b.value, label: b.label }))}
                        value={billingInterval}
                        onChange={(e) => setBillingInterval(e.currentTarget.value)}
                    />
                    <Group grow align="flex-start">
                        <TextInput
                            label="Price"
                            placeholder="0.00"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            required
                        />
                        <TextInput
                            label="Currency"
                            placeholder="USD"
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value)}
                            maxLength={3}
                            styles={{ input: { textTransform: 'uppercase' } }}
                            required
                        />
                    </Group>

                    <TextInput
                        label="Trial days (optional)"
                        placeholder="e.g. 14"
                        value={trialDays}
                        onChange={(e) => setTrialDays(e.target.value)}
                        description="If set, subscriptions created from checkout start in Trialing status until this many days have passed."
                        inputMode="numeric"
                    />

                    {/* Payment platforms */}
                    <Box>
                        <Text size="sm" fw={500} mb={8}>Accepted payment platforms</Text>
                        <Stack gap={8}>
                            {ALL_PLATFORMS.map((p) => (
                                <Checkbox
                                    key={p.value}
                                    checked={platforms.includes(p.value)}
                                    onChange={() => togglePlatform(p.value)}
                                    label={
                                        <Group gap="xs" align="center">
                                            <Image
                                                src={p.logo}
                                                h={20}
                                                w="auto"
                                                fit="contain"
                                                alt={p.label}
                                            />
                                            <Text size="sm">{p.label}</Text>
                                        </Group>
                                    }
                                />
                            ))}
                        </Stack>
                    </Box>

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button
                            onClick={submit}
                            loading={busy}
                            disabled={!planName.trim() || !price.trim() || !currency.trim() || !productId || platforms.length === 0}
                            color="red"
                        >
                            {editing ? 'Save' : 'Create'}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </AppShellLayout>
    );
}
