import { Head, router } from '@inertiajs/react';
import {
    Alert,
    Badge,
    Button,
    Group,
    Modal,
    NativeSelect,
    Radio,
    Stack,
    Table,
    Text,
    TextInput,
} from '@mantine/core';
import { useEffect, useState } from 'react';

import AppShellLayout from '@/layouts/AppShellLayout';
import DataTableCard from '@/components/ui/DataTableCard';
import TablePaginationBar, { paginationFields } from '@/components/ui/TablePaginationBar';
import { apiJson, webUrl } from '@/lib/api';

type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

type PaymentRow = {
    id: number | null;
    team_id: number | null;
    invoice_id: number;
    amount: string;
    currency: string;
    original_amount: string | null;
    payment_method: string;
    status: string;
    transaction_reference: string | null;
};

type OpenInvoice = {
    id: number;
    amount: string;
    currency: string;
    due_date: string | null;
    customer_id: number;
};

const STATUS_COLORS: Record<string, string> = {
    succeeded: 'green',
    pending:   'yellow',
    processing:'blue',
    failed:    'red',
    refunded:  'gray',
};

export default function Index({
    items,
    filters,
    openInvoices,
}: {
    items: Paginated<PaymentRow>;
    filters: { q: string; per_page: number };
    openInvoices: OpenInvoice[];
}) {
    const [q, setQ] = useState(filters.q ?? '');

    useEffect(() => {
        const t = window.setTimeout(() => {
            router.get(
                '/payments',
                { q, page: 1, per_page: filters.per_page },
                { preserveState: true, preserveScroll: true, replace: true },
            );
        }, 300);
        return () => window.clearTimeout(t);
    }, [q, filters.per_page]);

    // ── Manual record payment modal ──────────────────────────────────────────
    const [manualOpen, setManualOpen]       = useState(false);
    const [manualBusy, setManualBusy]       = useState(false);
    const [manualErr,  setManualErr]        = useState<string | null>(null);
    const [invoiceId,  setInvoiceId]        = useState(openInvoices[0] ? String(openInvoices[0].id) : '');
    const [amount,     setAmount]           = useState('');
    const [paymentMethod, setPaymentMethod] = useState('card');
    const [reference,  setReference]        = useState('');

    // ── EcoCash modal ────────────────────────────────────────────────────────
    const [ecoOpen,     setEcoOpen]     = useState(false);
    const [ecoBusy,     setEcoBusy]     = useState(false);
    const [ecoErr,      setEcoErr]      = useState<string | null>(null);
    const [ecoInvoice,  setEcoInvoice]  = useState(openInvoices[0] ? String(openInvoices[0].id) : '');
    const [ecoPhone,    setEcoPhone]    = useState('');
    const [ecoCurrency, setEcoCurrency] = useState<'ZWG' | 'USD'>('ZWG');
    const [ecoResult,   setEcoResult]   = useState<{
        reference_code: string;
        local_amount: string;
        local_currency: string;
        status: string;
    } | null>(null);
    const [ecoPolling,  setEcoPolling]  = useState(false);

    // ── Helpers ──────────────────────────────────────────────────────────────
    function selectedInvoice(id: string): OpenInvoice | undefined {
        return openInvoices.find((inv) => String(inv.id) === id);
    }

    const invoiceOptions =
        openInvoices.length > 0
            ? openInvoices.map((inv) => ({
                  value: String(inv.id),
                  label: `#${inv.id} · ${inv.currency} ${inv.amount} · due ${inv.due_date ?? '—'}`,
              }))
            : [{ value: '', label: 'No open invoices', disabled: true }];

    // ── Manual record ────────────────────────────────────────────────────────
    async function submitManual() {
        setManualBusy(true);
        setManualErr(null);
        try {
            await apiJson(webUrl('/payments'), {
                method: 'POST',
                body: JSON.stringify({
                    invoice_id: Number(invoiceId),
                    amount,
                    payment_method: paymentMethod,
                    transaction_reference: reference || null,
                }),
            });
            setManualOpen(false);
            setAmount('');
            setReference('');
            router.reload();
        } catch (e) {
            setManualErr(e instanceof Error ? e.message : 'Request failed');
        } finally {
            setManualBusy(false);
        }
    }

    // ── EcoCash initiate ─────────────────────────────────────────────────────
    async function submitEcoCash() {
        setEcoBusy(true);
        setEcoErr(null);
        setEcoResult(null);
        try {
            const data = await apiJson(webUrl('/ecocash/initiate'), {
                method: 'POST',
                body: JSON.stringify({
                    invoice_id:   Number(ecoInvoice),
                    phone_number: ecoPhone,
                    currency: ecoCurrency,
                }),
            }) as typeof ecoResult;
            setEcoResult(data);
        } catch (e) {
            setEcoErr(e instanceof Error ? e.message : 'Request failed');
        } finally {
            setEcoBusy(false);
        }
    }

    // ── EcoCash poll status ──────────────────────────────────────────────────
    async function pollStatus() {
        if (!ecoResult) return;
        setEcoPolling(true);
        try {
            const data = await apiJson(webUrl(`/ecocash/status/${ecoResult.reference_code}`)) as {
                status: string;
            };
            setEcoResult((prev) => prev ? { ...prev, status: data.status } : prev);
            if (data.status === 'completed') {
                setEcoOpen(false);
                setEcoResult(null);
                setEcoPhone('');
                router.reload();
            }
        } catch {
            // silent — user can retry
        } finally {
            setEcoPolling(false);
        }
    }

    function closeEcoModal() {
        setEcoOpen(false);
        setEcoResult(null);
        setEcoErr(null);
        setEcoPhone('');
    }

    return (
        <AppShellLayout
            title="Payments"
            subtitle="Recorded payments against invoices."
            actions={
                <Group gap="xs">
                    <Button
                        variant="light"
                        color="green"
                        onClick={() => setEcoOpen(true)}
                        disabled={openInvoices.length === 0}
                    >
                        Pay with EcoCash
                    </Button>
                    <Button
                        color="red"
                        onClick={() => setManualOpen(true)}
                        disabled={openInvoices.length === 0}
                    >
                        Record payment
                    </Button>
                </Group>
            }
        >
            <Head title="Payments" />

            <Stack gap="md">
                <Group justify="space-between" align="center" wrap="wrap">
                    <TextInput
                        placeholder="Search amount, status, method, reference, or customer…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        maw={400}
                    />
                    <Text size="sm" c="dimmed">
                        {items.data.length} of {items.total} shown
                    </Text>
                </Group>

            <DataTableCard>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Amount (USD)</Table.Th>
                        <Table.Th>Original</Table.Th>
                        <Table.Th>Method</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Invoice</Table.Th>
                        <Table.Th>Reference</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {items.data.length === 0 ? (
                        <Table.Tr>
                            <Table.Td colSpan={6}>
                                <Text c="dimmed" size="sm" py="md" ta="center">
                                    {q ? 'No matches.' : 'No payments recorded yet.'}
                                </Text>
                            </Table.Td>
                        </Table.Tr>
                    ) : (
                        items.data.map((p) => (
                            <Table.Tr key={p.id ?? `${p.invoice_id}-${p.amount}`}>
                                <Table.Td fw={600}>{p.amount}</Table.Td>
                                <Table.Td>
                                    {p.original_amount ? (
                                        <Text size="sm" c="dimmed">
                                            {p.original_amount}
                                        </Text>
                                    ) : '—'}
                                </Table.Td>
                                <Table.Td>{p.payment_method}</Table.Td>
                                <Table.Td>
                                    <Badge
                                        color={STATUS_COLORS[p.status] ?? 'gray'}
                                        variant="light"
                                        size="sm"
                                    >
                                        {p.status}
                                    </Badge>
                                </Table.Td>
                                <Table.Td>
                                    <Text size="sm" ff="monospace">
                                        #{p.invoice_id}
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    <Text size="sm" c="dimmed">
                                        {p.transaction_reference ?? '—'}
                                    </Text>
                                </Table.Td>
                            </Table.Tr>
                        ))
                    )}
                </Table.Tbody>
            </DataTableCard>

            <TablePaginationBar meta={paginationFields(items)} q={q} path="/payments" />
            </Stack>

            {/* ── Manual record payment modal ──────────────────────────────── */}
            <Modal opened={manualOpen} onClose={() => setManualOpen(false)} title="Record payment" centered>
                <Stack gap="md">
                    {manualErr && (
                        <Alert color="red" title="Could not record payment">
                            {manualErr}
                        </Alert>
                    )}
                    <NativeSelect
                        label="Invoice"
                        data={invoiceOptions}
                        value={invoiceId}
                        onChange={(e) => setInvoiceId(e.currentTarget.value)}
                        disabled={openInvoices.length === 0}
                    />
                    <TextInput
                        label="Amount (USD)"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.currentTarget.value)}
                        required
                    />
                    <TextInput
                        label="Payment method"
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.currentTarget.value)}
                        required
                    />
                    <TextInput
                        label="Transaction reference (optional)"
                        value={reference}
                        onChange={(e) => setReference(e.currentTarget.value)}
                    />
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setManualOpen(false)}>
                            Cancel
                        </Button>
                        <Button color="red" loading={manualBusy} onClick={submitManual}>
                            Save
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            {/* ── EcoCash payment modal ────────────────────────────────────── */}
            <Modal
                opened={ecoOpen}
                onClose={closeEcoModal}
                title="Pay with EcoCash"
                centered
            >
                <Stack gap="md">
                    {ecoErr && (
                        <Alert color="red" title="EcoCash error">
                            {ecoErr}
                        </Alert>
                    )}

                    {!ecoResult ? (
                        <>
                            <NativeSelect
                                label="Invoice"
                                data={invoiceOptions}
                                value={ecoInvoice}
                                onChange={(e) => setEcoInvoice(e.currentTarget.value)}
                                disabled={openInvoices.length === 0}
                            />
                            {selectedInvoice(ecoInvoice) && (
                                <Text size="sm" c="dimmed">
                                    Invoice amount: <strong>{selectedInvoice(ecoInvoice)!.currency} {selectedInvoice(ecoInvoice)!.amount}</strong>
                                    {' '}(will be converted to ZWG at the current rate)
                                </Text>
                            )}
                            <TextInput
                                label="EcoCash phone number"
                                placeholder="0777 000 000"
                                value={ecoPhone}
                                onChange={(e) => setEcoPhone(e.currentTarget.value)}
                                required
                            />
                            <Radio.Group
                                label="Currency"
                                description="Choose the currency for this EcoCash payment."
                                value={ecoCurrency}
                                onChange={(v) => setEcoCurrency((v as 'ZWG' | 'USD') ?? 'ZWG')}
                            >
                                <Group mt="xs">
                                    <Radio value="ZWG" label="ZWG" />
                                    <Radio value="USD" label="USD" />
                                </Group>
                            </Radio.Group>
                            <Group justify="flex-end">
                                <Button variant="default" onClick={closeEcoModal}>
                                    Cancel
                                </Button>
                                <Button
                                    color="green"
                                    loading={ecoBusy}
                                    disabled={!ecoPhone}
                                    onClick={submitEcoCash}
                                >
                                    Send payment request
                                </Button>
                            </Group>
                        </>
                    ) : (
                        <>
                            <Alert
                                color={ecoResult.status === 'completed' ? 'green' : 'yellow'}
                                title={ecoResult.status === 'completed' ? 'Payment completed!' : 'Awaiting approval'}
                            >
                                {ecoResult.status === 'completed'
                                    ? 'Your EcoCash payment was received and the invoice has been updated.'
                                    : `A payment request for ${ecoResult.local_currency} ${ecoResult.local_amount} has been sent to your phone. Please approve it in the EcoCash app.`
                                }
                            </Alert>
                            <Text size="sm" c="dimmed" ff="monospace">
                                Ref: {ecoResult.reference_code}
                            </Text>
                            <Group justify="flex-end">
                                <Button variant="default" onClick={closeEcoModal}>
                                    Close
                                </Button>
                                {ecoResult.status !== 'completed' && (
                                    <Button
                                        variant="light"
                                        color="green"
                                        loading={ecoPolling}
                                        onClick={pollStatus}
                                    >
                                        Check status
                                    </Button>
                                )}
                            </Group>
                        </>
                    )}
                </Stack>
            </Modal>
        </AppShellLayout>
    );
}
