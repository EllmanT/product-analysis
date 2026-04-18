import { Badge, Button, Group, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { Link } from '@inertiajs/react';
import AdminLayout from '../../../Layouts/AdminLayout';

function fmtMoney(value) {
    if (value === null || value === undefined) {
        return '—';
    }
    const n = Number(value);
    return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : String(value);
}

function fmtDate(iso) {
    if (!iso) {
        return '—';
    }
    const s = typeof iso === 'string' ? iso.slice(0, 10) : '';
    return s || '—';
}

export default function Show({ invoice }) {
    const buyerLabel = invoice.buyer?.register_name ?? invoice.buyer_snapshot?.register_name ?? '—';

    return (
        <AdminLayout title={`Invoice ${invoice.invoice_no}`}>
            <Group justify="space-between" mb="md" wrap="wrap">
                <Button component={Link} href="/admin/invoices" variant="default" size="sm">
                    ← Back to invoices
                </Button>
                <Badge size="lg">{invoice.status}</Badge>
            </Group>

            <Stack gap="md">
                <Paper shadow="xs" p="md" radius="md" withBorder>
                    <Title order={5} mb="sm">
                        Summary
                    </Title>
                    <Stack gap="xs">
                        <Group justify="space-between" wrap="wrap">
                            <Text size="sm" c="dimmed">
                                Receipt date
                            </Text>
                            <Text size="sm">{fmtDate(invoice.receipt_date)}</Text>
                        </Group>
                        <Group justify="space-between" wrap="wrap">
                            <Text size="sm" c="dimmed">
                                Type / form
                            </Text>
                            <Text size="sm">
                                {invoice.receipt_type} · {invoice.receipt_print_form}
                            </Text>
                        </Group>
                        <Group justify="space-between" wrap="wrap">
                            <Text size="sm" c="dimmed">
                                Currency
                            </Text>
                            <Text size="sm">{invoice.receipt_currency}</Text>
                        </Group>
                        <Group justify="space-between" wrap="wrap">
                            <Text size="sm" c="dimmed">
                                Tax inclusive
                            </Text>
                            <Text size="sm">{invoice.tax_inclusive ? 'Yes' : 'No'}</Text>
                        </Group>
                        <Group justify="space-between" wrap="wrap">
                            <Text size="sm" c="dimmed">
                                Total
                            </Text>
                            <Text size="sm" fw={600}>
                                {fmtMoney(invoice.receipt_total)} {invoice.receipt_currency}
                            </Text>
                        </Group>
                        {(invoice.total_excl_tax != null || invoice.total_vat != null) && (
                            <>
                                <Group justify="space-between" wrap="wrap">
                                    <Text size="sm" c="dimmed">
                                        Excl. tax / VAT
                                    </Text>
                                    <Text size="sm">
                                        {fmtMoney(invoice.total_excl_tax)} / {fmtMoney(invoice.total_vat)}
                                    </Text>
                                </Group>
                            </>
                        )}
                        <Group justify="space-between" wrap="wrap">
                            <Text size="sm" c="dimmed">
                                Payment
                            </Text>
                            <Text size="sm">
                                {invoice.payment_method} · {fmtMoney(invoice.payment_amount)} {invoice.receipt_currency}
                            </Text>
                        </Group>
                        {invoice.customer_reference && (
                            <Group justify="space-between" wrap="wrap">
                                <Text size="sm" c="dimmed">
                                    Customer reference
                                </Text>
                                <Text size="sm">{invoice.customer_reference}</Text>
                            </Group>
                        )}
                        {invoice.receipt_notes && (
                            <div>
                                <Text size="sm" c="dimmed" mb={4}>
                                    Notes
                                </Text>
                                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                                    {invoice.receipt_notes}
                                </Text>
                            </div>
                        )}
                        {invoice.created_by_user && (
                            <Group justify="space-between" wrap="wrap">
                                <Text size="sm" c="dimmed">
                                    Created by
                                </Text>
                                <Text size="sm">
                                    {invoice.created_by_user.first_name} {invoice.created_by_user.last_name} ({invoice.created_by_user.email})
                                </Text>
                            </Group>
                        )}
                        {invoice.fiscal_submission_at && (
                            <Group justify="space-between" wrap="wrap">
                                <Text size="sm" c="dimmed">
                                    Fiscal submission
                                </Text>
                                <Text size="sm">{fmtDate(invoice.fiscal_submission_at)}</Text>
                            </Group>
                        )}
                    </Stack>
                </Paper>

                <Paper shadow="xs" p="md" radius="md" withBorder>
                    <Title order={5} mb="sm">
                        Company
                    </Title>
                    {invoice.company ? (
                        <Stack gap={4}>
                            <Text fw={500}>{invoice.company.legal_name}</Text>
                            {invoice.company.trade_name && (
                                <Text size="sm" c="dimmed">
                                    {invoice.company.trade_name}
                                </Text>
                            )}
                            <Text size="sm">TIN: {invoice.company.tin ?? '—'}</Text>
                            <Text size="sm">{invoice.company.email ?? '—'}</Text>
                        </Stack>
                    ) : (
                        <Text c="dimmed">—</Text>
                    )}
                </Paper>

                <Paper shadow="xs" p="md" radius="md" withBorder>
                    <Title order={5} mb="sm">
                        Buyer
                    </Title>
                    {invoice.buyer ? (
                        <Stack gap={4}>
                            <Text fw={500}>{invoice.buyer.register_name}</Text>
                            {invoice.buyer.trade_name && (
                                <Text size="sm" c="dimmed">
                                    {invoice.buyer.trade_name}
                                </Text>
                            )}
                            <Text size="sm">TIN: {invoice.buyer.tin ?? '—'}</Text>
                            <Text size="sm">{invoice.buyer.email ?? '—'}</Text>
                            <Text size="sm">{invoice.buyer.phone ?? '—'}</Text>
                        </Stack>
                    ) : (
                        <Stack gap={4}>
                            <Text size="sm" c="dimmed">
                                Snapshot / reference
                            </Text>
                            <Text fw={500}>{buyerLabel}</Text>
                        </Stack>
                    )}
                </Paper>

                <Paper shadow="xs" p="md" radius="md" withBorder>
                    <Title order={5} mb="md">
                        Line items
                    </Title>
                    {invoice.lines?.length ? (
                        <Table.ScrollContainer minWidth={720}>
                            <Table striped highlightOnHover withTableBorder>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>#</Table.Th>
                                        <Table.Th>Description</Table.Th>
                                        <Table.Th>Qty</Table.Th>
                                        <Table.Th>Unit price</Table.Th>
                                        <Table.Th>Tax</Table.Th>
                                        <Table.Th style={{ textAlign: 'right' }}>Line total</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {invoice.lines.map((line) => (
                                        <Table.Tr key={line.id}>
                                            <Table.Td>{line.line_no}</Table.Td>
                                            <Table.Td>
                                                <Text size="sm">{line.description}</Text>
                                                <Text size="xs" c="dimmed">
                                                    {line.line_type}
                                                    {line.hs_code ? ` · HS ${line.hs_code}` : ''}
                                                </Text>
                                            </Table.Td>
                                            <Table.Td>{fmtMoney(line.quantity)}</Table.Td>
                                            <Table.Td>{fmtMoney(line.unit_price)}</Table.Td>
                                            <Table.Td>
                                                {line.tax_code} ({line.tax_percent}%)
                                            </Table.Td>
                                            <Table.Td style={{ textAlign: 'right' }}>
                                                {fmtMoney(line.line_total_incl)} {invoice.receipt_currency}
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    ) : (
                        <Text c="dimmed" size="sm">
                            No lines on this invoice.
                        </Text>
                    )}
                </Paper>

                {invoice.taxes?.length > 0 && (
                    <Paper shadow="xs" p="md" radius="md" withBorder>
                        <Title order={5} mb="md">
                            Tax breakdown
                        </Title>
                        <Table.ScrollContainer minWidth={480}>
                            <Table striped withTableBorder>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Code</Table.Th>
                                        <Table.Th>%</Table.Th>
                                        <Table.Th style={{ textAlign: 'right' }}>Sales w/ tax</Table.Th>
                                        <Table.Th style={{ textAlign: 'right' }}>Tax amount</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {invoice.taxes.map((t) => (
                                        <Table.Tr key={t.id}>
                                            <Table.Td>{t.tax_code}</Table.Td>
                                            <Table.Td>{t.tax_percent}</Table.Td>
                                            <Table.Td style={{ textAlign: 'right' }}>{fmtMoney(t.sales_amount_with_tax)}</Table.Td>
                                            <Table.Td style={{ textAlign: 'right' }}>{fmtMoney(t.tax_amount)}</Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </Table.ScrollContainer>
                    </Paper>
                )}

                {invoice.ref_invoice_no && (
                    <Paper shadow="xs" p="md" radius="md" withBorder>
                        <Title order={5} mb="sm">
                            Reference invoice
                        </Title>
                        <Stack gap="xs">
                            <Text size="sm">
                                {invoice.ref_invoice_no} · {fmtDate(invoice.ref_invoice_date)}
                            </Text>
                            {invoice.ref_customer_reference && (
                                <Text size="sm" c="dimmed">
                                    Ref customer: {invoice.ref_customer_reference}
                                </Text>
                            )}
                        </Stack>
                    </Paper>
                )}

                {invoice.buyer_snapshot && typeof invoice.buyer_snapshot === 'object' && (
                    <Paper shadow="xs" p="md" radius="md" withBorder>
                        <Title order={5} mb="sm">
                            Buyer snapshot
                        </Title>
                        <Text
                            component="pre"
                            size="xs"
                            style={{
                                overflow: 'auto',
                                maxHeight: 240,
                                margin: 0,
                                fontFamily: 'ui-monospace, monospace',
                            }}
                        >
                            {JSON.stringify(invoice.buyer_snapshot, null, 2)}
                        </Text>
                    </Paper>
                )}
            </Stack>
        </AdminLayout>
    );
}
