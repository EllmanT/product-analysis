import { Badge, Paper, Table, Text } from '@mantine/core';
import AdminLayout from '../../../Layouts/AdminLayout';
import TableControls from '../../../Components/Admin/TableControls';

export default function Index({ products, filters }) {
    const { data, current_page, last_page, total } = products;

    return (
        <AdminLayout title="Products">
            <Paper shadow="xs" p="md" radius="md" withBorder>
                <TableControls
                    baseUrl="/admin/products"
                    filters={filters}
                    total={total}
                    lastPage={last_page}
                    currentPage={current_page}
                >
                    <Table striped highlightOnHover withTableBorder>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Name</Table.Th>
                                <Table.Th>Company</Table.Th>
                                <Table.Th>Price</Table.Th>
                                <Table.Th>Active</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {data.map((row) => (
                                <Table.Tr key={row.id}>
                                    <Table.Td>{row.name}</Table.Td>
                                    <Table.Td>{row.company?.legal_name ?? '—'}</Table.Td>
                                    <Table.Td>
                                        {row.default_unit_price} {row.tax_code ? <Text span size="xs" c="dimmed">({row.tax_code})</Text> : null}
                                    </Table.Td>
                                    <Table.Td>
                                        <Badge color={row.is_active ? 'green' : 'gray'}>{row.is_active ? 'Yes' : 'No'}</Badge>
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
