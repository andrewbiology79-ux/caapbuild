import React from 'react';
import { Header } from '../components/Header';
import { SlidersHorizontal } from 'lucide-react';

/** Placeholder — the full Filter tab is built in the next step. */
export const FilterScreen: React.FC = () => (
  <div className="flex-1 flex flex-col pb-20">
    <Header title="Filter" />
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-[#64748B] p-6 text-center">
      <SlidersHorizontal className="w-10 h-10" />
      <p className="text-sm">ফিল্টার ট্যাব পরের ধাপে তৈরি হবে।</p>
    </div>
  </div>
);

export default FilterScreen;
