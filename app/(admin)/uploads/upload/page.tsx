import { auth } from '@/auth'
import FileUpload from '@/components/FileUpload'
import React from 'react'

const page = async() => {
  const session = await auth()
const user = session?.user
  return (
<div>
              <FileUpload userId={user?.id}/>

    
    </div>  )
}

export default page