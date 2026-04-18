import { Anchor, Badge, Paper, Table, Text } from '@mantine/core';
import { Link } from '@inertiajs/react';
import AdminLayout from '../../../Layouts/AdminLayout';
import TableControls from '../../../Components/Admin/TableControls';

export default function Index({ invoices, filters }) {
    const { data, current_page, last_page, total } = invoices;

    return (
        <AdminLayout title="Invoices">
            <Paper shadow="xs" p="md" radius="md" withBorder>
                <TableControls
                    baseUrl="/admin/invoices"
                    filters={filters}
                    total={total}
                    lastPage={last_page}
                    currentPage={current_page}
                >
                    <Table striped highlightOnHover withTableBorder>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Invoice no.</Table.Th>
                                <Table.Th>Company</Table.Th>
                                <Table.Th>Status</Table.Th>
                                <Table.Th>Total</Table.Th>
                                <Table.Th>Date</Table.Th>
                                <Table.Th style={{ width: 100 }}>Detail</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {data.map((row) => (
                                <Table.Tr key={row.id}>
                                    <Table.Td>
                                        <Anchor component={Link} href={`/admin/invoices/${row.id}`} fw={500}>
                                            {row.invoice_no}
                                        </Anchor>
                                    </Table.Td>
                                    <Table.Td>{row.company?.legal_name ?? '—'}</Table.Td>
                                    <Table.Td>
                                        <Badge>{row.status}</Badge>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text span fw={500}>
                                            {row.receipt_total}
                                        </Text>{' '}
                                        {row.receipt_currency}
                                    </Table.Td>
                                    <Table.Td>{row.receipt_date?.slice?.(0, 10) ?? '—'}</Table.Td>
                                    <Table.Td>
                                        <Anchor component={Link} href={`/admin/invoices/${row.id}`} size="sm">
                                            View
                                        </Anchor>
                                    </Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </TableControls>
            </Paper>
        </AdminLayout>
    );
}
