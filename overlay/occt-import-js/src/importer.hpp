#pragma once

#include <string>
#include <vector>
#include <memory>
#include <functional>
#include <utility>

#include <TopoDS_Shape.hxx>

class Node;
class Importer;
using NodePtr = std::shared_ptr<const Node>;
using ImporterPtr = std::shared_ptr<Importer>;

class Color
{
public:
    Color ();
    Color (double r, double g, double b);

    double r;
    double g;
    double b;
};

class Face
{
public:
    Face ();
    virtual ~Face ();

    virtual bool HasNormals () const = 0;
    virtual bool GetColor (Color& color) const = 0;

    virtual void EnumerateVertices (const std::function<void (double, double, double)>& onVertex) const = 0;
    virtual void EnumerateNormals (const std::function<void (double, double, double)>& onNormal) const = 0;
    virtual void EnumerateTriangles (const std::function<void (int, int, int)>& onTriangle) const = 0;
};

class Mesh
{
public:
    Mesh ();
    virtual ~Mesh ();

    virtual std::string GetName () const = 0;
    // CAD Viewer: stable part id of the node this mesh belongs to ("" = none).
    virtual std::string GetPartId () const { return std::string (); }
    virtual bool GetColor (Color& color) const = 0;
    virtual void EnumerateFaces (const std::function<void (const Face& face)>& onFace) const = 0;
};

class Node
{
public:
    Node ();
    virtual ~Node ();

    virtual std::string GetName () const = 0;
    // CAD Viewer: stable part id ("xcf:<label entry>", "brep:root"); "" = none.
    virtual std::string GetPartId () const { return std::string (); }
    // CAD Viewer: the node's whole B-rep (null if none).
    virtual TopoDS_Shape GetTopoShape () const { return TopoDS_Shape (); }
    // CAD Viewer: the (part id, B-rep) units exact topology is extracted from. By default the node
    // is one unit; the BREP importer reports one unit per mesh.
    virtual std::vector<std::pair<std::string, TopoDS_Shape>> GetTopoUnits () const
    {
        return { { GetPartId (), GetTopoShape () } };
    }
    virtual std::vector<NodePtr> GetChildren () const = 0;

    virtual bool IsMeshNode () const = 0;
    virtual void EnumerateMeshes (const std::function<void (const Mesh&)>& onMesh) const = 0;
};

class ImportParams
{
public:
    enum class LinearUnit
    {
        Millimeter,
        Centimeter,
        Meter,
        Inch,
        Foot
    };

    enum class LinearDeflectionType
    {
        BoundingBoxRatio,
        AbsoluteValue
    };

    ImportParams ();

    LinearUnit linearUnit;
    LinearDeflectionType linearDeflectionType;
    double linearDeflection;
    double angularDeflection;
};

class Importer
{
public:
    enum class Result
    {
        Success = 0,
        FileNotFound = 1,
        ImportFailed = 2
    };

    Importer ();
    virtual ~Importer ();

    Result LoadFile (const std::string& filePath, const ImportParams& params);

    // CAD Viewer: resolves a part id (as emitted by Node/Mesh::GetPartId) to its shape.
    virtual bool ResolvePart (const std::string& partId, TopoDS_Shape& shape) const { return false; }

    virtual Result LoadFile (const std::vector<std::uint8_t>& fileContent, const ImportParams& params) = 0;
    virtual NodePtr GetRootNode () const = 0;
};
