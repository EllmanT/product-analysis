import { Badge, Paper, Table } from '@mantine/core';
import AdminLayout from '../../../Layouts/AdminLayout';
import TableControls from '../../../Components/Admin/TableControls';

export default function Index({ buyers, filters }) {
    const { data, current_page, last_page, total } = buyers;

    return (
        <AdminLayout title="Buyers">
            <Paper shadow="xs" p="md" radius="md" withBorder>
                <TableControls
                    baseUrl="/admin/buyers"
                    filters={filters}
                    total={total}
                    lastPage={last_page}
                    currentPage={current_page}
                >
                    <Table striped highlightOnHover withTableBorder>
                        <Table.Thead>
                            <Table.Tr>
                                <Table.Th>Register name</Table.Th>
                                <Table.Th>Company</Table.Th>
                                <Table.Th>TIN</Table.Th>
                                <Table.Th>Email</Table.Th>
                                <Table.Th>Active</Table.Th>
                            </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                            {data.map((row) => (
                                <Table.Tr key={row.id}>
                                    <Table.Td>{row.register_name}</Table.Td>
                                    <Table.Td>{row.company?.legal_name ?? '—'}</Table.Td>
                                    <Table.Td>{row.tin ?? '—'}</Table.Td>
                                    <Table.Td>{row.email ?? '—'}</Table.Td>
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
