"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { formUrlQuery, removeKeysFromUrlQuery } from "@/lib/url";

import { SearchIcon } from "lucide-react";
import GlobalResult from "../GlobalResult";
import { Badge } from "../ui/badge";

const GlobalSearch = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const query = searchParams.get("global");

  const [search, setSearch] = useState(query || "");
  const [isOpen, setIsOpen] = useState(query || false);
const [selectedProduct, setSelectedProduct] = useState<GlobalSearchedItem | null>(null);
  const searchContainerRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        // @ts-expect-error Property 'contains' does not exist on type 'EventTarget | null'.
        !searchContainerRef.current?.contains(event.target)
      ) {
        setIsOpen(false);
        setSearch("");
      }
    };

    document.addEventListener("click", handleOutsideClick);

    return () => {
      document.removeEventListener("click", handleOutsideClick);
    };
  }, []);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (search) {
        const newUrl = formUrlQuery({
          params: searchParams.toString(),
          key: "global",
          value: search,
        });

        router.push(newUrl, { scroll: false });
      } else {
        if (query) {
          const newUrl = removeKeysFromUrlQuery({
            params: searchParams.toString(),
            keysToRemove: ["global", "type"],
          });

          router.push(newUrl, { scroll: false });
        }
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [search, pathname, router, searchParams, query]);

  const handleProductSelect = (item: GlobalSearchedItem) => {
  setSelectedProduct(item); // or whatever logic updates the parent
};

  console.log(selectedProduct)

const handleCloseSearch = () => {
  console.log("in here")
  setIsOpen(false); // example for hiding dropdown/modal
};
console.log(isOpen)
  
  return (
    <div
      className="relative w-full max-w-[600px] max-lg:hidden"
      ref={searchContainerRef}
    >
      <div className=" relative flex min-h-[56px] grow items-center gap-1 rounded-xl px-4">
      

        <Input
          type="text"
          placeholder="Search for any product..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!isOpen) setIsOpen(true);
            if (e.target.value === "" && isOpen) setIsOpen(false);
          }}
          className="paragraph-regular no-focus placeholder  border shadow-none outline-none"
        />
          <SearchIcon
          width={24}
          height={24}
          className="cursor-pointer"
        />
      </div>
      {selectedProduct &&
      <>
     Selected Item : <Badge className=""> {selectedProduct.title} - {selectedProduct.code}</Badge> 
     </>
      }
     
      {isOpen && <GlobalResult 
    
  onSelectItem={handleProductSelect}
  onClose={handleCloseSearch}
      />}
    </div>
  );
};

export default GlobalSearch;
