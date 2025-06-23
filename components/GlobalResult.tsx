"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import GlobalFilter from "./filter/GlobalFilter";
import { IconReload } from "@tabler/icons-react";
import { globalSearch } from "@/lib/actions/general.action";
import { TagIcon } from "lucide-react";
import { Badge } from "./ui/badge";
import { formUrlQuery } from "@/lib/url";

type Props = {
  // results: GlobalSearchedItem[];
  onSelectItem: (item: GlobalSearchedItem) => void;
  onClose: () => void;
};

const GlobalResult = ({ onSelectItem, onClose }: Props) => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [result, setResult] = useState([]);
  const [isLoading, setLoading] = useState(true);

  const global = searchParams.get("global");
  const type = searchParams.get("type");

  useEffect(() => {
    const fetchResult = async () => {
      setResult([]);
      setLoading(true);

      try {
        const res = await globalSearch({
          query: global as string,
          type,
        });

        console.log(res);

        setResult(res.data);
      } catch (error) {
        console.log(error);
        setResult([]);
      } finally {
        setLoading(false);
      }
    };

    if (global) {
      fetchResult();
    }
  }, [global, type]);


const handleUpdateProduct = (item: GlobalSearchedItem) => {
  const queryKey = "productId"; // Replace with actual key if different
  const value = item.id; // Replace with the actual value you want to set

  const newUrl = formUrlQuery({
    params: searchParams.toString(),
    key: queryKey,
    value: value,
  });

  router.push(newUrl, { scroll: false });
  onSelectItem(item);  // Notify parent
    onClose();           // Close modal/dropdown
};

  return (
    <div className="absolute top-full z-5 mt-3 w-full rounded-xl bg-gray-50 py-5 shadow-2xl ">
      <GlobalFilter />
      <div className="my-5 h-px bg-light-700/50 dark:bg-dark-500/50" />

      <div className="space-y-1">
        <p className="text-dark400_light900 paragraph-semibold px-5">
          Top Match:
        </p>

        {isLoading ? (
          <div className="flex-center flex-col px-5">
            <IconReload className="my-2 size-10 animate-spin text-primary-500" />
            <p className="text-dark200_light800 body-regular">
              Browsing the whole database..
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {result?.length > 0 ? (
              result?.map((item: GlobalSearchedItem, index) => (
                <div
                //   href={renderLink(item.type, item.id)}
                  key={item.type + item.id + index}
                  onClick={() => handleUpdateProduct(item)}
                  className="flex w-full cursor-pointer items-start gap-3 px-5 py-2.5 hover:bg-light-700/50 hover:bg-gray-200"
                >
                  <TagIcon
                    width={18}
                    height={18}
                    className="invert-colors mt-1 object-contain"
                  />

                  <div className="flex flex-col">
                    <p className="body-medium text-dark200_light800 line-clamp-1">
                      {item.title} <Badge>{item.code}</Badge>
                    </p>
                    <p className="text-light400_light500 small-medium mt-1 font-bold capitalize">
                      {item.type}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex-center flex-col px-5">
                <p className="text-5xl">🫣</p>
                <p className="text-dark200_light800 body-regular px-5 py-2.5">
                  Oops, no results found
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default GlobalResult;
