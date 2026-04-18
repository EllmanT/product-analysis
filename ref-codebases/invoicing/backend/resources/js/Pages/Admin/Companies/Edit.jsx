import { Button, Checkbox, Group, Paper, Stack, TextInput, Title } from '@mantine/core';
import { Link, router, usePage } from '@inertiajs/react';
import { useForm } from '@mantine/form';
import { useEffect } from 'react';
import AdminLayout from '../../../Layouts/AdminLayout';

export default function Edit({ company }) {
    const { errors } = usePage().props;

    const form = useForm({
        initialValues: {
            legal_name: company.legal_name ?? '',
            trade_name: company.trade_name ?? '',
            tin: company.tin ?? '',
            vat_number: company.vat_number ?? '',
            email: company.email ?? '',
            phone: company.phone ?? '',
            region: company.region ?? '',
            station: company.station ?? '',
            province: company.province ?? '',
            city: company.city ?? '',
            address_line: company.address_line ?? '',
            house_number: company.house_number ?? '',
            is_active: !!company.is_active,
        },
    });

    useEffect(() => {
        if (!errors || typeof errors !== 'object') return;
        if (Object.keys(errors).length === 0) {
            form.clearErrors();
        } else {
            form.setErrors(errors);
        }
    }, [errors]);

    return (
        <AdminLayout title="Edit company" description="Update company profile fields. Disabling removes it from tenant flows but keeps data for audit/support.">
            <Paper
                component="form"
                shadow="sm"
                p="xl"
                radius="lg"
                withBorder
                maw={720}
                onSubmit={form.onSubmit((values) => {
                    router.put(`/admin/companies/${company.id}`, {
                        ...values,
                        trade_name: values.trade_name || null,
                        vat_number: values.vat_number || null,
                        email: values.email || null,
                        phone: values.phone || null,
                        region: values.region || null,
                        station: values.station || null,
                        province: values.province || null,
                        city: values.city || null,
                        address_line: values.address_line || null,
                        house_number: values.house_number || null,
                    });
                })}
            >
                <Title order={5} mb="lg" fw={600}>
                    Company fields
                </Title>
                <Stack gap="md">
                    <TextInput label="Legal name" required withAsterisk {...form.getInputProps('legal_name')} />
                    <TextInput label="Trade name" {...form.getInputProps('trade_name')} />
                    <Group grow>
                        <TextInput label="TIN" required withAsterisk {...form.getInputProps('tin')} />
                        <TextInput label="VAT" {...form.getInputProps('vat_number')} />
                    </Group>
                    <Group grow>
                        <TextInput label="Email" type="email" {...form.getInputProps('email')} />
                        <TextInput label="Phone" {...form.getInputProps('phone')} />
                    </Group>
                    <Group grow>
                        <TextInput label="Region" {...form.getInputProps('region')} />
                        <TextInput label="Station" {...form.getInputProps('station')} />
                    </Group>
                    <Group grow>
                        <TextInput label="Province" {...form.getInputProps('province')} />
                        <TextInput label="City" {...form.getInputProps('city')} />
                    </Group>
                    <Group grow>
                        <TextInput label="Address" {...form.getInputProps('address_line')} />
                        <TextInput label="House number" {...form.getInputProps('house_number')} />
                    </Group>
                    <Checkbox label="Active" {...form.getInputProps('is_active', { type: 'checkbox' })} />

                    <Group justify="space-between" mt="md">
                        <Button component={Link} href={`/admin/companies/${company.id}`} variant="default" type="button">
                            Cancel
                        </Button>
                        <Button color="red" type="submit">
                            Save
                        </Button>
                    </Group>
                </Stack>
            </Paper>
        </AdminLayout>
    );
}

