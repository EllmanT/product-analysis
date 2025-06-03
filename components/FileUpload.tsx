"use client"
import React, { startTransition, useState, useTransition } from 'react'
import { Button } from './ui/button';
import { z } from 'zod';
import { uploadFileSchema, uploadProductsSchema } from '@/lib/validations';
import { uploadProducts } from '@/lib/actions/product.action';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from './ui/form';
import { Input } from './ui/input';
import { LoaderPinwheelIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { auth } from '@/auth';


const FileUpload = ({userId}:{userId:string}) => {

    const [file, setFile] = useState<File | null>(null);
        const [extractedText, setExtractedText] = useState<string>("");
        const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
        const [uploadingFile, setUploadingFile]= useState(false);


  const [isPending, startTransition] = useTransition();
  const form = useForm<z.infer<typeof uploadProductsSchema>>({
    resolver: zodResolver(uploadProductsSchema),
    defaultValues: {
      file:undefined
    },
  });
  

  

const handleUploadProducts = async (
  data: z.infer<typeof uploadProductsSchema>
) => {
  const formData = new FormData();
  formData.append("file", data.file);
  // Append userId
formData.append("userId", userId);

  startTransition(async () => {
    const { success, data: responseData, error } = await api.products.upload(formData);

    if (success) {
      console.log("Upload successful:", responseData);
      // Maybe show toast or redirect
    } else {
      console.error("Upload failed:", error);
      // Show error to user
    }
  });
};
    
  return (
     <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="p-6 flex flex-col bg-white shadow-lg rounded-xl w-96 text-center">
        <h2 className="text-xl font-semibold mb-4">Upload TXT File</h2>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleUploadProducts)} className="flex flex-col gap-6">
            <FormField
              control={form.control}
              name="file"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-700">Select a .txt file</FormLabel>
                  <FormControl>
                    <Input
                      type="file"
                      accept=".txt"
                      onChange={(e) => field.onChange(e.target.files?.[0])}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {form.watch("file") && (
              <p className="text-sm text-gray-600">Selected: {form.watch("file")?.name}</p>
            )}

            {extractedText && (
              <p className="text-sm text-gray-600">Extracted: {extractedText}</p>
            )}

            <Button
              type="submit"
              className="bg-blue-600 text-white hover:bg-blue-700"
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <LoaderPinwheelIcon className="mr-2 size-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                "Upload Text File"
              )}
            </Button>

            {downloadUrl && (
              <a href={downloadUrl} download className="mt-2 text-green-600 underline">
                Download Excel File
              </a>
            )}
          </form>
        </Form>
      </div>
    </div>
  )
}

export default FileUpload