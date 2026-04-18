import { router } from '@inertiajs/react';
import {
    ActionIcon,
    Alert,
    Badge,
    Box,
    Button,
    Card,
    Group,
    LoadingOverlay,
    Modal,
    SimpleGrid,
    Stack,
    Table,
    Text,
    TextInput,
    Textarea,
    Tooltip,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconCurrencyDollar,
    IconPlus,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import AppShellLayout from '@/layouts/AppShellLayout';
import DataTableCard from '@/components/ui/DataTableCard';
import EmptyState from '@/components/ui/EmptyState';
import TablePaginationBar, { paginationFields } from '@/components/ui/TablePaginationBar';
import { apiJson, webUrl } from '@/lib/api';

type Paginated<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

type RateRow = {
    id: number;
    currency: string;
    rate: string;
    effective_date: string;
    notes: string | null;
    created_at: string;
};

type CurrentRate = {
    currency: string;
    rate: string;
    effective_date: string;
};

type Props = {
    rates: Paginated<RateRow>;
    filters: { q: string; per_page: number };
    currentRates: CurrentRate[];
    baseCurrency: string;
};

export default function Index({ rates, filters, currentRates, baseCurrency }: Props) {
    const [q, setQ] = useState(filters.q ?? '');

    useEffect(() => {
        const t = window.setTimeout(() => {
            router.get(
                '/exchange-rates',
                { q, page: 1, per_page: filters.per_page },
                { preserveState: true, preserveScroll: true, replace: true },
            );
        }, 300);
        return () => window.clearTimeout(t);
    }, [q, filters.per_page]);

    const [open, setOpen] = useState(false);
    const [currency, setCurrency] = useState('ZWG');
    const [rate, setRate] = useState('');
    const [effectiveDate, setEffectiveDate] = useState(
        new Date().toISOString().split('T')[0],
    );
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    function openCreate() {
        setCurrency('ZWG');
        setRate('');
        setEffectiveDate(new Date().toISOString().split('T')[0]);
        setNotes('');
        setErr(null);
        setOpen(true);
    }

    async function submit() {
        if (!currency.trim() || !rate || !effectiveDate) {
            setErr('Currency, rate, and effective date are required.');
            return;
        }
        setBusy(true);
        setErr(null);
        try {
            await apiJson(webUrl('/exchange-rates'), {
                method: 'POST',
                body: JSON.stringify({
                    currency: currency.trim().toUpperCase(),
                    rate: parseFloat(rate),
                    effective_date: effectiveDate,
                    notes: notes.trim() || null,
                }),
            });
            setOpen(false);
            router.reload({ only: ['rates', 'currentRates', 'filters', 'baseCurrency'] });
        } catch (e: unknown) {
            setErr(e instanceof Error ? e.message : 'Failed to save rate.');
        } finally {
            setBusy(false);
        }
    }

    async function remove(id: number, cur: string) {
        if (!confirm(`Delete ${cur} rate entry? This cannot be undone.`)) return;
        try {
            await apiJson(webUrl(`/exchange-rates/${id}`), { method: 'DELETE' });
            router.reload({ only: ['rates', 'currentRates', 'filters', 'baseCurrency'] });
        } catch (e: unknown) {
            alert(e instanceof Error ? e.message : 'Delete failed.');
        }
    }

    return (
        <AppShellLayout
            title="Exchange Rates"
            subtitle={`Base currency: ${baseCurrency}. Define how many units of another currency equal 1 ${baseCurrency}.`}
            actions={
                <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
                    Add rate
                </Button>
            }
        >
            <Stack gap="lg">
                {/* Current rates summary */}
                {currentRates.length > 0 && (
                    <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="sm">
                        <Card withBorder radius="md" p="md">
                            <Group gap="xs">
                                <IconCurrencyDollar size={20} />
                                <Text fw={600}>{baseCurrency}</Text>
                            </Group>
                            <Text size="xl" fw={700} mt="xs">1.000000</Text>
                            <Text size="xs" c="dimmed">Base currency</Text>
                        </Card>
                        {currentRates.map((r) => (
                            <Card withBorder radius="md" p="md" key={r.currency}>
                                <Group gap="xs" justify="space-between">
                                    <Text fw={600}>{r.currency}</Text>
                                    <Badge size="sm" color="blue" variant="light">
                                        as of {r.effective_date}
                                    </Badge>
                                </Group>
                                <Text size="xl" fw={700} mt="xs">{parseFloat(r.rate).toFixed(4)}</Text>
                                <Text size="xs" c="dimmed">per 1 {baseCurrency}</Text>
                            </Card>
                        ))}
                    </SimpleGrid>
                )}

                {/* History table */}
                <Group justify="space-between" align="center" wrap="wrap">
                    <TextInput
                        placeholder="Search currency, rate, or notes…"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        maw={360}
                    />
                    <Text size="sm" c="dimmed">
                        {rates.data.length} of {rates.total} shown
                    </Text>
                </Group>
                <Box pos="relative">
                    <LoadingOverlay visible={busy} zIndex={2} />
                    {rates.data.length === 0 ? (
                        <EmptyState
                            title={q ? 'No matches' : 'No exchange rates yet'}
                            description={
                                q
                                    ? 'Try a different search.'
                                    : `Add your first rate to enable payments in currencies other than ${baseCurrency}.`
                            }
                            action={
                                !q ? (
                                    <Button leftSection={<IconRefresh size={16} />} onClick={openCreate}>
                                        Add first rate
                                    </Button>
                                ) : undefined
                            }
                        />
                    ) : (
                        <>
                        <DataTableCard>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Currency</Table.Th>
                                    <Table.Th>Rate (per 1 {baseCurrency})</Table.Th>
                                    <Table.Th>Effective date</Table.Th>
                                    <Table.Th>Notes</Table.Th>
                                    <Table.Th>Added</Table.Th>
                                    <Table.Th />
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {rates.data.map((r) => (
                                    <Table.Tr key={r.id}>
                                        <Table.Td>
                                            <Badge variant="light">{r.currency}</Badge>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text fw={500} size="sm" ff="monospace">
                                                {parseFloat(r.rate).toFixed(6)}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm">{r.effective_date}</Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm" c="dimmed" lineClamp={1}>
                                                {r.notes ?? '—'}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td>
                                            <Text size="sm" c="dimmed">{r.created_at}</Text>
                                        </Table.Td>
                                        <Table.Td style={{ textAlign: 'right' }}>
                                            <Tooltip label="Delete" withArrow>
                                                <ActionIcon
                                                    color="red"
                                                    variant="subtle"
                                                    onClick={() => remove(r.id, r.currency)}
                                                >
                                                    <IconTrash size={16} />
                                                </ActionIcon>
                                            </Tooltip>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </DataTableCard>
                        <TablePaginationBar meta={paginationFields(rates)} q={q} path="/exchange-rates" />
                        </>
                    )}
                </Box>
            </Stack>

            {/* Add rate modal */}
            <Modal opened={open} onClose={() => setOpen(false)} title="Add exchange rate" centered>
                <Stack gap="md">
                    {err && (
                        <Alert color="red" icon={<IconAlertCircle size={16} />}>
                            {err}
                        </Alert>
                    )}
                    <TextInput
                        label="Currency code"
                        description={`The non-${baseCurrency} currency, e.g. ZWG`}
                        placeholder="ZWG"
                        value={currency}
                        onChange={(e) => setCurrency(e.currentTarget.value.toUpperCase())}
                        required
                    />
                    <TextInput
                        label={`Rate (units per 1 ${baseCurrency})`}
                        description={`e.g. 13.5 means 1 ${baseCurrency} = 13.5 ZWG`}
                        placeholder="13.500000"
                        value={rate}
                        onChange={(e) => setRate(e.currentTarget.value)}
                        required
                    />
                    <TextInput
                        label="Effective date"
                        description="Date from which this rate applies"
                        type="date"
                        value={effectiveDate}
                        onChange={(e) => setEffectiveDate(e.currentTarget.value)}
                        required
                    />
                    <Textarea
                        label="Notes (optional)"
                        placeholder="e.g. RBZ official rate"
                        value={notes}
                        onChange={(e) => setNotes(e.currentTarget.value)}
                        rows={2}
                    />
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setOpen(false)} disabled={busy}>
                            Cancel
                        </Button>
                        <Button onClick={submit} loading={busy}>
                            Save rate
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </AppShellLayout>
    );
}
