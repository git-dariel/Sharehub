import SideMenu from "@/components/layout/side-menu";
import TopNavigation from "@/components/layout/top-nav";
import React from "react";
import DashboardContent from "./admin/dashboard-page";

function Dashboard() {
  return (
    <div className="flex h-screen bg-[#f8fafd]">
      <SideMenu />
      <div className="flex flex-col flex-1 ">
        <TopNavigation />
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Main Content */}
          <DashboardContent />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
