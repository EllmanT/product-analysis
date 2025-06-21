import { auth } from '@/auth'
import FileUpload from '@/components/FileUpload'
import ROUTES from '@/constants/route'
import { getUser } from '@/lib/actions/user.action'
import { redirect } from 'next/navigation'
import React from 'react'

const page = async() => {
  const session = await auth()
const sessionData = session?.user
if(!sessionData?.id) redirect(ROUTES.SIGN_IN)

  const { data } = await getUser({ userId: sessionData.id });
    
  const  user = data?.user;
    if(!user?.branchId) redirect(ROUTES.SIGN_IN)

      const branchId = user.branchId!
      const storeId = user.storeId!
  return (
<div>
              <FileUpload userId={user._id}  branchId={branchId} storeId={storeId}/>

    
    </div>  )
}

export default page