#pragma once

#include "importer.hpp"

#include <TopoDS_Shape.hxx>

class ImporterBrep : public Importer
{
public:
    ImporterBrep ();

    virtual Result LoadFile (const std::vector<std::uint8_t>& fileContent, const ImportParams& params) override;
    virtual NodePtr GetRootNode () const override;
    virtual bool ResolvePart (const std::string& partId, TopoDS_Shape& shape) const override;

private:
    TopoDS_Shape shape;
};
