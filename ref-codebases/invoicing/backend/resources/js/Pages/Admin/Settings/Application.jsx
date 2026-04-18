import { Button, Checkbox, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { router, usePage } from '@inertiajs/react';
import { notifications } from '@mantine/notifications';
import { useEffect } from 'react';
import AdminLayout from '../../../Layouts/AdminLayout';

export default function Application({ settings, envNote }) {
    const { flash } = usePage().props;

    useEffect(() => {
        if (flash?.success) {
            notifications.show({ title: 'Saved', message: flash.success, color: 'green' });
        }
    }, [flash?.success]);

    const form = useForm({
        initialValues: {
            app_name: settings.app_name,
            app_url: settings.app_url,
            app_debug: settings.app_debug,
            timezone: settings.timezone,
        },
    });

    return (
        <AdminLayout title="Application" description="Branding and runtime defaults stored in the database (where supported).">
            <Paper
                shadow="xs"
                p="lg"
                radius="md"
                withBorder
                w="100%"
                maw="100%"
                style={{ alignSelf: 'stretch', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}
            >
                <Title order={4} mb="xs">
                    Application
                </Title>
                <Text size="sm" c="dimmed" mb="lg">
                    {envNote}
                </Text>
                <form
                    onSubmit={form.onSubmit((values) => {
                        router.put('/admin/settings/application', values);
                    })}
                >
                    <Stack>
                        <TextInput label="Application name" required {...form.getInputProps('app_name')} />
                        <TextInput label="Application URL" required {...form.getInputProps('app_url')} />
                        <Checkbox label="Debug mode (show detailed errors)" {...form.getInputProps('app_debug', { type: 'checkbox' })} />
                        <TextInput label="Timezone" required description="e.g. Africa/Harare, UTC" {...form.getInputProps('timezone')} />
                        <Button type="submit" color="red" w="fit-content">
                            Save application
                        </Button>
                    </Stack>
                </form>
            </Paper>
        </AdminLayout>
    );
}
