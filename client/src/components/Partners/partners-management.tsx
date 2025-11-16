import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { PartnerDetails } from "./partners-details";
import type { Order, DeliveryPartner } from "@/types/index";

interface PartnersManagementProps {
    partners: DeliveryPartner[];
    deliveries: any[];
    loading?: boolean;
    onCreatePartner: (data: Partial<DeliveryPartner>) => Promise<void>;
    onUpdatePartner: (id: string, data: Partial<DeliveryPartner>) => Promise<void>;
    onDeletePartner: (id: string) => Promise<void>;
    onRefresh?: () => Promise<void>;
}

export function PartnersManagement({
    partners = [],
    deliveries = [],
    loading,
    onCreatePartner,
    onUpdatePartner,
    onDeletePartner,
    onRefresh,
}: PartnersManagementProps) {
    const [selectedPartner, setSelectedPartner] = useState<DeliveryPartner | null>(null);
    const [searchValue, setSearchValue] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Filter partners by search
    const filteredPartners = useMemo(() => {
        return partners.filter(
            (p) =>
                searchValue === "" ||
                p.name.toLowerCase().includes(searchValue.toLowerCase()) ||
                p.email?.toLowerCase().includes(searchValue.toLowerCase()) ||
                (p.phone && p.phone.includes(searchValue))
        );
    }, [partners, searchValue]);

    // Helper: Get today's deliveries for a partner
    const getTodayDeliveryCount = (partnerId: string) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return deliveries.filter(
            (d) =>
                d.deliveryPartnerId === partnerId &&
                d.startTime >= today
        ).length;
    };

    // Table columns
    const columns: Column<DeliveryPartner>[] = [
        { key: "name", title: "Name", render: (_, record) => record.name },
        { key: "email", title: "Email", render: (_, record) => record.email || "-" },
        { key: "phone", title: "Phone", render: (_, record) => record.phone || "-" },
        {
            key: "status",
            title: "Status",
            render: (_, record) => (
                <Badge
                    className={
                        record.status === "online"
                            ? "bg-green-100 text-green-800"
                            : record.status === "offline"
                                ? "bg-gray-100 text-gray-800"
                                : "bg-yellow-100 text-yellow-800"
                    }
                >
                    {record.status}
                </Badge>
            ),
        },
        {
            key: "approved",
            title: "Admin Approved",
            render: (_, record) => (
                <Badge
                    className={record.adminApproved ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}
                >
                    {record.adminApproved ? "Approved" : "Not Approved"}
                </Badge>
            ),
        },
        {
            key: "todayDeliveries",
            title: "Today's Deliveries",
            render: (_, record) => getTodayDeliveryCount(record.id),
        },
        {
            key: "actions",
            title: "Actions",
            render: (_, record) => (
                <div className="flex gap-2">
                    <button onClick={() => setSelectedPartner(record)}>Edit</button>
                    <button onClick={() => onDeletePartner(record.id)}>Delete</button>
                </div>
            ),
        },
    ];

    const handleSearch = (value: string) => {
        setSearchValue(value);
        setCurrentPage(1);
    };

    const totalItems = filteredPartners.length;
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedData = filteredPartners.slice(startIndex, endIndex);

    return (
        <div className="p-6 space-y-6">
            <DataTable
                data={paginatedData}
                columns={columns}
                loading={loading}
                pagination={{
                    current: currentPage,
                    pageSize,
                    total: totalItems,
                    onPageChange: (page, size) => {
                        setCurrentPage(page);
                        setPageSize(size);
                    },
                }}
                filters={{
                    search: { placeholder: "Search by name, email or phone", onSearch: handleSearch },
                }}
                onRefresh={onRefresh}
            />

            {selectedPartner && (
                <PartnerDetails
                    partner={selectedPartner}
                    todayDeliveries={getTodayDeliveryCount(selectedPartner.id)}
                    onClose={() => setSelectedPartner(null)}
                    onSave={(data) => onUpdatePartner(selectedPartner.id, data)}
                />
            )}
        </div>
    );
}
