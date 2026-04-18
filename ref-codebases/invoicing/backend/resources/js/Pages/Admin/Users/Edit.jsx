import { Button, Checkbox, Group, Paper, Select, Stack, TextInput, Title } from '@mantine/core';
import { Link, router, usePage } from '@inertiajs/react';
import { useForm } from '@mantine/form';
import { useEffect } from 'react';
import AdminLayout from '../../../Layouts/AdminLayout';

export default function Edit({ user, companies }) {
    const { errors } = usePage().props;

    const form = useForm({
        initialValues: {
            first_name: user.first_name ?? '',
            last_name: user.last_name ?? '',
            email: user.email ?? '',
            phone: user.phone ?? '',
            role: user.role ?? 'USER',
            company_id: user.company_id ?? '',
            is_active: !!user.is_active,
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

    const companyData = [{ value: '', label: 'No company' }, ...(companies ?? [])];

    return (
        <AdminLayout title="Edit user" description="Update user profile, role, and optional company link.">
            <Paper
                component="form"
                shadow="sm"
                p="xl"
                radius="lg"
                withBorder
                maw={560}
                onSubmit={form.onSubmit((values) => {
                    router.put(`/admin/users/${user.id}`, {
                        ...values,
                        company_id: values.company_id || null,
                    });
                })}
            >
                <Title order={5} mb="lg" fw={600}>
                    User fields
                </Title>
                <Stack gap="md">
                    <Group grow>
                        <TextInput label="First name" required withAsterisk {...form.getInputProps('first_name')} />
                        <TextInput label="Last name" required withAsterisk {...form.getInputProps('last_name')} />
                    </Group>
                    <TextInput label="Email" required withAsterisk type="email" {...form.getInputProps('email')} />
                    <TextInput label="Phone" {...form.getInputProps('phone')} />
                    <Select
                        label="Role"
                        data={[
                            { value: 'USER', label: 'User' },
                            { value: 'ADMIN', label: 'Admin' },
                        ]}
                        {...form.getInputProps('role')}
                    />
                    <Select label="Company" data={companyData} {...form.getInputProps('company_id')} />
                    <Checkbox label="Active" {...form.getInputProps('is_active', { type: 'checkbox' })} />
                    <Group justify="space-between" mt="md">
                        <Button component={Link} href={`/admin/users/${user.id}`} variant="default" type="button">
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

