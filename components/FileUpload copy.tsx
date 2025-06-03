"use client"
import React, { startTransition, useState } from 'react'
import { Button } from './ui/button';
import { z } from 'zod';
import { uploadFileSchema, uploadProductsSchema } from '@/lib/validations';
import { uploadProducts } from '@/lib/actions/product.action';

const FileUpload = () => {
    const [file, setFile] = useState<File | null>(null);
    const [extractedText, setExtractedText] = useState<string>("");
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [uploadingFile, setUploadingFile]= useState(false);

    
  
    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files.length > 0) {
        setFile(event.target.files[0]);
      }
  
      console.log(file)
    };
  
    const handleFileUpload = async () => {
      setUploadingFile(true)
      if (!file) return alert("Please select a file first");
  
      const formData = new FormData();
      formData.append("file", file);
  
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
  
      console.log("data", data)
      console.log("data content", data.content)
  
      const stringData = data.content
      if (response.ok) {
  
        console.log("This is the body:",response.body)
        setExtractedText(stringData)
        setDownloadUrl(data.downloadUrl);
        setUploadingFile(false)
      } else {
        alert("Error processing the file");
      }
    };
    const handleUploadProducts= async(
      data:z.infer<typeof uploadProductsSchema>
    )=>{
        startTransition(async()=>{
            console.log(data)
            console.log(result)
            const result = await uploadProducts(data);
            console.log(data)
            console.log(result)
        
        })
    }
  return (
    <div className="flex  items-center justify-center min-h-screen bg-gray-100">
      <div className="p-6 flex flex-col bg-white shadow-lg rounded-xl w-96 text-center">
        <h2 className="text-xl font-semibold mb-4">Upload TXT File</h2>
        <label className="border-2 border-dashed border-gray-300 p-6 w-full rounded-lg cursor-pointer hover:bg-gray-50">
          <input type="file" accept=".txt" className="hidden" onChange={handleFileChange} />
          <span className="text-gray-500">Click or drag to upload txt file</span>
        </label>
        {file && <p className="mt-4 text-sm text-gray-600">Selected: {file.name}</p>}

       
        {extractedText && <p className="mt-4 text-sm text-gray-600">Extracted: {extractedText}</p>}
   
        
      
        <Button className={`mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 ${uploadingFile ?"  cursor-pointer":""}`}
        onClick={handleUploadProducts}
        disabled={uploadingFile}
        >
         {uploadingFile ?  
         "Uploading....": "Upload Text File"}
        </Button>
       
        
        {downloadUrl && (
        <div className="mt-3">
          <Button
        className="bg-green-500 text-white px-4 py-2 rounded-lg mt-4"
        >
          <a 
            href={downloadUrl} 
            download 
            className=""
            // onClick={handleReset}
          >
            Download Excel File
          </a>
          </Button>
        </div>
      )}
        
       
      </div>
    </div>
  )
}

export default FileUpload